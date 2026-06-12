import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { runGuidedDrillDown } from '@/lib/guidedAnalysisAgent'

const schema = z.object({
  selection: z.string().min(1),
  action:    z.literal('drilldown'),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; analysisId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, analysisId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const analysis = await db.guidedAnalysis.findUnique({ where: { id: analysisId } })
  if (!analysis || analysis.projectId !== projectId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body   = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { selection, action } = parsed.data

  const finding = await db.guidedAnalysisFinding.create({
    data: { analysisId, selection, action, status: 'pending' },
  })

  const response = await runGuidedDrillDown(selection, {
    projectId:           analysis.projectId,
    coreQuestion:        analysis.coreQuestion,
    stakeholderLiteracy: analysis.stakeholderLiteracy,
  })
  const updated = await db.guidedAnalysisFinding.update({
    where: { id: finding.id },
    data: { response, status: 'complete' },
  })
  return NextResponse.json({ finding: updated })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; analysisId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, analysisId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const findings = await db.guidedAnalysisFinding.findMany({
    where: { analysisId },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(findings)
}
