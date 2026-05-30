import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  trigger: z.string().optional(),
  notes: z.string().optional(),
  requiresDataLayer: z.boolean().optional(),
  isKeyEvent: z.boolean().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, id } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const event = await db.event.findUnique({ where: { id } })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [eventParamLinks, globalParams] = await Promise.all([
    db.eventParameter.findMany({
      where: { eventId: id },
      include: { parameter: true },
      orderBy: { parameter: { name: 'asc' } },
    }),
    db.parameter.findMany({
      where: { isGlobal: true, projectId },
      orderBy: { name: 'asc' },
    }),
  ])

  const eventParamIds = new Set(eventParamLinks.map((l) => l.parameterId))
  const uniqueGlobals = globalParams.filter((p) => !eventParamIds.has(p.id))

  const parameters = [
    ...uniqueGlobals.map((p) => ({ ...p, isGlobalAttached: true, value: 'dynamic' })),
    ...eventParamLinks.map((l) => ({ ...l.parameter, isGlobalAttached: false, value: l.value ?? 'dynamic' })),
  ]

  return NextResponse.json({ ...event, parameters })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, id } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const event = await db.event.update({ where: { id }, data: parsed.data })
  return NextResponse.json(event)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, id } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.event.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
