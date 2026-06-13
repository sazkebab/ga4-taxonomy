import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { runGuidedAmendment, type AmendTurn } from '@/lib/guidedAnalysisAgent'

const schema = z.object({ message: z.string().min(1) })

// Continue the chat on an "amend" finding — sends a follow-up instruction
// (e.g. "no, the percentage should be of total sessions, not just mobile")
// and re-runs the investigation with the prior conversation as context.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; analysisId: string; findingId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, analysisId, findingId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const analysis = await db.guidedAnalysis.findUnique({ where: { id: analysisId } })
  if (!analysis || analysis.projectId !== projectId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const finding = await db.guidedAnalysisFinding.findUnique({ where: { id: findingId } })
  if (!finding || finding.analysisId !== analysisId || finding.action !== 'amend') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body   = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  let history: AmendTurn[] = []
  try {
    const parsedHistory = JSON.parse(finding.conversation || '[]')
    if (Array.isArray(parsedHistory)) history = parsedHistory
  } catch { /* fall back to empty history */ }

  const result = await runGuidedAmendment(finding.selection, history, parsed.data.message, {
    projectId:           analysis.projectId,
    coreQuestion:        analysis.coreQuestion,
    stakeholderLiteracy: analysis.stakeholderLiteracy,
  })

  const updatedHistory: AmendTurn[] = [
    ...history,
    { role: 'user', content: result.userMessage },
    { role: 'assistant', content: result.rawResponse },
  ]

  const updated = await db.guidedAnalysisFinding.update({
    where: { id: findingId },
    data: {
      response:     result.explanation,
      proposedText: result.proposedText || finding.proposedText,
      conversation: JSON.stringify(updatedHistory),
      status:       'complete',
    },
  })

  return NextResponse.json({ finding: updated })
}

// Remove a finding (drill-down or amendment) from the report. The report
// markdown itself is untouched — this only deletes the side panel.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; analysisId: string; findingId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, analysisId, findingId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const analysis = await db.guidedAnalysis.findUnique({ where: { id: analysisId } })
  if (!analysis || analysis.projectId !== projectId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const finding = await db.guidedAnalysisFinding.findUnique({ where: { id: findingId } })
  if (!finding || finding.analysisId !== analysisId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db.guidedAnalysisFinding.delete({ where: { id: findingId } })
  return NextResponse.json({ ok: true })
}
