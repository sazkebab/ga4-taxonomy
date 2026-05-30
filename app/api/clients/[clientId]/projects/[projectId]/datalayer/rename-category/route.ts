/**
 * POST /api/.../datalayer/rename-category
 *   Body: { from: string, to: string }
 *   → Renames all events in projectId with category=from to category=to
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

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
  const { from, to } = body as { from?: string; to?: string }

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  }
  if (from === to) {
    return NextResponse.json({ updated: 0 })
  }

  const result = await db.event.updateMany({
    where: { projectId, category: from },
    data:  { category: to.trim().toLowerCase() },
  })

  return NextResponse.json({ updated: result.count })
}
