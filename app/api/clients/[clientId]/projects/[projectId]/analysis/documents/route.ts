import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const SOURCE_TYPES = ['user_test', 'survey', 'session_replay', 'interview', 'support', 'other'] as const

const createSchema = z.object({
  title:      z.string().min(1),
  content:    z.string().min(1),
  sourceType: z.enum(SOURCE_TYPES).default('other'),
  source:     z.string().default(''),
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

  const docs = await db.analysisDocument.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, sourceType: true, source: true, createdAt: true, content: true },
  })
  return NextResponse.json(docs)
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

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const doc = await db.analysisDocument.create({
    data: { projectId, ...parsed.data },
  })
  return NextResponse.json(doc, { status: 201 })
}
