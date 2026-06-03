import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const suppressions = await db.dataQualitySuppression.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(suppressions)
}
