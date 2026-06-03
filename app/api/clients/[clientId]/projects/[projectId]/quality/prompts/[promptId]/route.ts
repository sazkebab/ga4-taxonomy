import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const patchSchema = z.object({
  title:    z.string().min(1).optional(),
  content:  z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  order:    z.number().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; promptId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, promptId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const body   = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const updated = await db.dataQualityPrompt.updateMany({
    where: { id: promptId, projectId },
    data: parsed.data,
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; promptId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, promptId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  await db.dataQualityPrompt.deleteMany({ where: { id: promptId, projectId } })
  return NextResponse.json({ ok: true })
}
