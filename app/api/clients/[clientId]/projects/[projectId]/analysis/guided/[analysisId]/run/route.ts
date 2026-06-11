import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { getGoogleAccessToken } from '@/lib/token'
import { runGuidedAnalysis } from '@/lib/guidedAnalysisAgent'

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
  if (!analysis || analysis.projectId !== projectId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!analysis.coreQuestion) return NextResponse.json({ error: 'Complete the wizard first' }, { status: 400 })
  if (analysis.status === 'running') return NextResponse.json({ status: 'running' })

  // The Google access token depends on the request-scoped session (`auth()`),
  // so it must be resolved here — before we hand off to the detached
  // background task below, which keeps running after this response is sent.
  const accessToken = await getGoogleAccessToken()
  if (!accessToken) {
    const message = 'No Google access token — please sign out and sign back in.'
    await db.guidedAnalysis.update({
      where: { id: analysisId },
      data: { status: 'error', reportMarkdown: `⚠️ ${message}` },
    })
    return NextResponse.json({ error: message }, { status: 401 })
  }

  await db.guidedAnalysis.update({
    where: { id: analysisId },
    data: { status: 'running', reportMarkdown: '', progressLog: '[]' },
  })

  const data = {
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
  }

  // Run in the background — keeps going even if the client closes the tab,
  // navigates away, or refreshes. The frontend polls GET .../guided/[id] for
  // progress (reportMarkdown / progressLog) and final status.
  void runGuidedAnalysis(data, accessToken).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err)
    await db.guidedAnalysis.update({
      where: { id: analysisId },
      data: { status: 'error', reportMarkdown: `⚠️ Analysis failed: ${message}` },
    }).catch(() => {})
  })

  return NextResponse.json({ status: 'running' })
}
