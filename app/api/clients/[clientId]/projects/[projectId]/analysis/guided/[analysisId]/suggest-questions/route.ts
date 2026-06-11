import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { suggestSubQuestions } from '@/lib/guidedAnalysisAgent'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; analysisId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, analysisId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const analysis = await db.guidedAnalysis.findUnique({ where: { id: analysisId } })
  if (!analysis || analysis.projectId !== projectId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!analysis.coreQuestion) {
    return NextResponse.json({ error: 'Set a core question first' }, { status: 400 })
  }

  let questions: string[]
  try {
    questions = await suggestSubQuestions({
      id:                  analysis.id,
      projectId:           analysis.projectId,
      coreQuestion:        analysis.coreQuestion,
      useCase:             analysis.useCase,
      stakeholderName:     analysis.stakeholderName,
      stakeholderLiteracy: analysis.stakeholderLiteracy,
      keyKpis:             JSON.parse(analysis.keyKpis),
      insightDestination:  analysis.insightDestination,
      preferredOutputStyle:analysis.preferredOutputStyle,
      priorKnowledge:      analysis.priorKnowledge,
      subQuestions:        JSON.parse(analysis.subQuestions),
      hypotheses:          JSON.parse(analysis.hypotheses),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }

  await db.guidedAnalysis.update({
    where: { id: analysisId },
    data: { subQuestions: JSON.stringify(questions) },
  })

  return NextResponse.json({ subQuestions: questions })
}
