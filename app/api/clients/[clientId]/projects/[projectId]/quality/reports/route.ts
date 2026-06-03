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

  const reports = await db.dataQualityReport.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, weekStart: true, createdAt: true, completedAt: true, reportMarkdown: false },
    take: 20,
  })
  return NextResponse.json(reports)
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const weekStart = new Date()
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // start of current week

  const report = await db.dataQualityReport.create({
    data: { projectId, weekStart, status: 'pending' },
  })
  return NextResponse.json(report, { status: 201 })
}
