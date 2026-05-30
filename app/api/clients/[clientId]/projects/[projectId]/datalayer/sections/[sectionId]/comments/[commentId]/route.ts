/**
 * PATCH  /api/.../comments/[commentId]  → edit comment { body }
 * DELETE /api/.../comments/[commentId]  → delete comment
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; sectionId: string; commentId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, commentId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const comment = await db.dataLayerComment.update({
    where: { id: commentId },
    data: { body: body.trim() },
  })

  return NextResponse.json(comment)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; sectionId: string; commentId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, commentId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.dataLayerComment.delete({ where: { id: commentId } })
  return new NextResponse(null, { status: 204 })
}
