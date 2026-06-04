import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const patchSchema = z.object({
  name:    z.string().min(1).optional(),
  pattern: z.string().min(1).optional(),
  color:   z.string().optional(),
  order:   z.number().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; groupId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, groupId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const body   = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  await db.journeyPageGroup.updateMany({ where: { id: groupId, projectId }, data: parsed.data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; groupId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, groupId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  await db.journeyPageGroup.deleteMany({ where: { id: groupId, projectId } })
  return NextResponse.json({ ok: true })
}
