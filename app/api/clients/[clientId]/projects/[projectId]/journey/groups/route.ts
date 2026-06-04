import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const createSchema = z.object({
  name:    z.string().min(1),
  pattern: z.string().min(1),
  color:   z.string().default(''),
  order:   z.number().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const groups = await db.journeyPageGroup.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
  })
  return NextResponse.json(groups)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const body   = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const count = await db.journeyPageGroup.count({ where: { projectId } })
  const group = await db.journeyPageGroup.create({
    data: { projectId, ...parsed.data, order: parsed.data.order ?? count },
  })
  return NextResponse.json(group, { status: 201 })
}
