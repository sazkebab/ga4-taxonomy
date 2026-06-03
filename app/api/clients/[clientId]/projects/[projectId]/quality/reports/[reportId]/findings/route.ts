import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { runDrillDown } from '@/lib/qualityMonitorAgent'

const schema = z.object({
  selection: z.string().min(1),
  action:    z.enum(['suppress', 'drilldown']),
  label:     z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, reportId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const body   = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { selection, action, label } = parsed.data

  // Create the finding
  const finding = await db.dataQualityFinding.create({
    data: { reportId, selection, action, status: action === 'suppress' ? 'complete' : 'pending' },
  })

  // For suppress: also create a suppression rule
  if (action === 'suppress') {
    await db.dataQualitySuppression.create({
      data: { projectId, content: selection, label: label ?? selection.slice(0, 60) },
    })
    return NextResponse.json({ finding, suppressed: true })
  }

  // For drilldown: run Claude analysis (non-streaming for simplicity)
  const response = await runDrillDown(selection, projectId)
  const updated  = await db.dataQualityFinding.update({
    where: { id: finding.id },
    data: { response, status: 'complete' },
  })
  return NextResponse.json({ finding: updated })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, reportId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const findings = await db.dataQualityFinding.findMany({
    where: { reportId },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(findings)
}
