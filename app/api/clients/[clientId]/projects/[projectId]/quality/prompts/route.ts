import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const createSchema = z.object({
  title:   z.string().min(1),
  content: z.string().min(1),
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

  const prompts = await db.dataQualityPrompt.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
  })
  return NextResponse.json(prompts)
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

  const count  = await db.dataQualityPrompt.count({ where: { projectId } })
  const prompt = await db.dataQualityPrompt.create({
    data: { projectId, ...parsed.data, order: parsed.data.order ?? count },
  })
  return NextResponse.json(prompt, { status: 201 })
}
