/**
 * GET   /api/clients/[clientId]/projects/[projectId]/datalayer
 *   → Return full DataLayerDoc with sections (screenshot stubs — no dataUrl)
 *
 * PATCH /api/clients/[clientId]/projects/[projectId]/datalayer
 *   Body: { gtmContainerId? }
 *   → Update doc-level settings (creates the doc if it doesn't exist yet)
 *
 * POST  /api/clients/[clientId]/projects/[projectId]/datalayer
 *   Body: { scope: "all" | "event", eventId?: string }
 *   → Create/upsert doc + sections; regenerate codeBlock unless codeBlockCustomised
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { generateCodeBlock, getDefaultEcommerceJson, detectCategory } from '@/lib/dataLayerDoc'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const doc = await db.dataLayerDoc.findUnique({
    where: { projectId },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: {
          event: {
            include: {
              parameters: {
                include: {
                  parameter: {
                    select: { name: true, description: true, type: true, example: true },
                  },
                },
              },
            },
          },
          comments:       { orderBy: { createdAt: 'asc' } },
          paramNotes:     true,
          ecommerceNotes: true,
          screenshots: {
            select: { id: true, filename: true, createdAt: true }, // no dataUrl
          },
        },
      },
    },
  })

  if (!doc) return NextResponse.json(null)
  return NextResponse.json(doc)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { gtmContainerId } = body as { gtmContainerId?: string }

  const data: Record<string, unknown> = {}
  if (gtmContainerId !== undefined) data.gtmContainerId = gtmContainerId.trim()

  const doc = await db.dataLayerDoc.upsert({
    where:  { projectId },
    create: { projectId, ...data },
    update: data,
  })

  return NextResponse.json(doc)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { scope, eventId } = body as { scope: 'all' | 'event'; eventId?: string }

  // Load target events
  const eventWhere =
    scope === 'event' && eventId
      ? { id: eventId, projectId }
      : { projectId, requiresDataLayer: true }

  const events = await db.event.findMany({
    where: eventWhere,
    orderBy: { name: 'asc' },
    include: {
      parameters: {
        include: {
          parameter: {
            select: { name: true, example: true, type: true, description: true, isGlobal: true },
          },
        },
      },
    },
  })

  if (events.length === 0) {
    return NextResponse.json({ error: 'No events found' }, { status: 404 })
  }

  // Upsert the DataLayerDoc
  const doc = await db.dataLayerDoc.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
  })

  // For ordering: get all existing sections in the doc to calculate global alphabetical order
  const allEventNames =
    scope === 'all'
      ? events.map((e) => e.name).sort()
      : await (async () => {
          // merge existing section event names with new ones for stable ordering
          const existing = await db.dataLayerSection.findMany({
            where: { docId: doc.id },
            include: { event: { select: { name: true } } },
          })
          const allNames = [
            ...existing.map((s) => s.event.name),
            ...events.map((e) => e.name),
          ]
          return [...new Set(allNames)].sort()
        })()

  const orderMap = new Map(allEventNames.map((name, i) => [name, i]))

  // Upsert each section
  const upserted: string[] = []
  for (const event of events) {
    // Auto-detect category if none set
    if (!(event.category ?? '')) {
      const detected = detectCategory(event.name)
      if (detected) {
        await db.event.update({ where: { id: event.id }, data: { category: detected } })
        event.category = detected
      }
    }

    const params  = event.parameters.map((ep) => ({ ...ep.parameter, value: ep.value ?? 'dynamic' }))
    const order   = orderMap.get(event.name) ?? 0
    const isEcom  = (event.category ?? '').toLowerCase() === 'ecommerce'

    const existing = await db.dataLayerSection.findUnique({
      where: { eventId: event.id },
    })

    // Determine ecommerceJson: keep existing if present, else generate default
    const ecommerceJson =
      existing?.ecommerceJson ||
      (isEcom ? getDefaultEcommerceJson(event.name) : '')

    const codeBlock =
      existing?.codeBlockCustomised
        ? existing.codeBlock
        : generateCodeBlock(event.name, params, {
            category:      event.category,
            ecommerceJson: ecommerceJson || undefined,
          })

    if (existing) {
      await db.dataLayerSection.update({
        where: { id: existing.id },
        data: {
          order,
          ...(existing.codeBlockCustomised ? {} : { codeBlock }),
          // Always update ecommerceJson if the section didn't have one
          ...(existing.ecommerceJson ? {} : { ecommerceJson }),
        },
      })
    } else {
      await db.dataLayerSection.create({
        data: {
          docId: doc.id,
          eventId: event.id,
          order,
          codeBlock,
          ecommerceJson,
        },
      })
    }
    upserted.push(event.name)
  }

  return NextResponse.json({ generated: upserted.length, events: upserted })
}
