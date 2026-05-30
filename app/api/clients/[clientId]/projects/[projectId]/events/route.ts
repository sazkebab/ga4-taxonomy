import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  trigger: z.string().optional(),
  requiresDataLayer: z.boolean().optional(),
  isKeyEvent: z.boolean().optional(),
})

export async function GET(
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

  const q = req.nextUrl.searchParams.get('q') ?? ''
  const filter = req.nextUrl.searchParams.get('filter') ?? ''

  const where: Record<string, unknown> = { projectId }
  if (q) where.name = { contains: q }
  if (filter === 'keyEvent') where.isKeyEvent = true
  if (filter === 'dataLayer') where.requiresDataLayer = true

  const events = await db.event.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { _count: { select: { parameters: true } } },
  })

  const eventsWithProgress = events.map((event) => {
    const checklistItems = [
      event.checkDocumented,
      event.checkDataLayerDoc,
      event.checkGtmSetUp,
      event.checkGtmPasses,
      ...(event.isKeyEvent ? [event.checkGa4KeyEvent] : []),
    ]
    const total = checklistItems.length
    const done = checklistItems.filter(Boolean).length
    return { ...event, checklistDone: done, checklistTotal: total }
  })

  return NextResponse.json(eventsWithProgress)
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
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const event = await db.event.create({
    data: {
      projectId,
      name: parsed.data.name,
      category: parsed.data.category ?? '',
      trigger: parsed.data.trigger ?? '',
      requiresDataLayer: parsed.data.requiresDataLayer ?? false,
      isKeyEvent: parsed.data.isKeyEvent ?? false,
    },
  })

  return NextResponse.json(event, { status: 201 })
}
