import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, reportId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const report = await db.dataQualityReport.findUnique({
    where: { id: reportId },
    include: { findings: { orderBy: { createdAt: 'asc' } } },
  })
  if (!report || report.projectId !== projectId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(report)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, reportId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  await db.dataQualityReport.deleteMany({ where: { id: reportId, projectId } })
  return NextResponse.json({ ok: true })
}
