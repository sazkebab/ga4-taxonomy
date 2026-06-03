import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; suppressionId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, suppressionId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const { isActive } = await req.json()
  const updated = await db.dataQualitySuppression.updateMany({
    where: { id: suppressionId, projectId },
    data: { isActive },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; suppressionId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, suppressionId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  await db.dataQualitySuppression.deleteMany({ where: { id: suppressionId, projectId } })
  return NextResponse.json({ ok: true })
}
