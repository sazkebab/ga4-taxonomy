/**
 * POST /api/clients/[clientId]/projects/[projectId]/events/copy
 * Copies events (by ID) from any accessible project into this project.
 * Parameters are upserted into this client by name, then linked.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/access'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; projectId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, projectId } = await params

  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sourceEventIds } = await req.json() as { sourceEventIds: string[] }
  if (!Array.isArray(sourceEventIds) || sourceEventIds.length === 0) {
    return NextResponse.json({ error: 'sourceEventIds required' }, { status: 400 })
  }

  // Load source events with their parameters
  const sourceEvents = await db.event.findMany({
    where: { id: { in: sourceEventIds } },
    include: {
      parameters: {
        include: { parameter: true },
      },
    },
  })

  let created = 0
  let skipped = 0

  for (const src of sourceEvents) {
    // Check if event already exists in target project (by name — not a hard block, just skip)
    const existing = await db.event.findFirst({ where: { projectId, name: src.name } })
    if (existing) { skipped++; continue }

    // Create the event
    const newEvent = await db.event.create({
      data: {
        projectId,
        name: src.name,
        trigger: src.trigger,
        isKeyEvent: src.isKeyEvent,
        requiresDataLayer: src.requiresDataLayer,
      },
    })
    created++

    // Copy parameters: upsert in target client, then link
    for (const ep of src.parameters) {
      const param = await db.parameter.upsert({
        where: { projectId_name: { projectId, name: ep.parameter.name } },
        update: {},
        create: {
          projectId,
          name: ep.parameter.name,
          description: ep.parameter.description,
          type: ep.parameter.type,
          isGlobal: ep.parameter.isGlobal,
          requiresGA4Registration: ep.parameter.requiresGA4Registration,
        },
      })

      await db.eventParameter.upsert({
        where: { eventId_parameterId: { eventId: newEvent.id, parameterId: param.id } },
        update: {},
        create: { eventId: newEvent.id, parameterId: param.id },
      })
    }
  }

  return NextResponse.json({ created, skipped })
}
