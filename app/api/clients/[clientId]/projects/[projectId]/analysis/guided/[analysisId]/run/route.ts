import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { streamGuidedAnalysis } from '@/lib/guidedAnalysisAgent'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; analysisId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })
  const { projectId, analysisId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return new Response('Forbidden', { status: 403 }) }

  const analysis = await db.guidedAnalysis.findUnique({ where: { id: analysisId } })
  if (!analysis || analysis.projectId !== projectId) return new Response('Not found', { status: 404 })
  if (!analysis.coreQuestion) return new Response('Complete the wizard first', { status: 400 })

  await db.guidedAnalysis.update({ where: { id: analysisId }, data: { status: 'running', reportMarkdown: '' } })

  const encoder = new TextEncoder()
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

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamGuidedAnalysis(data)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
      } catch (err) {
        await db.guidedAnalysis.update({ where: { id: analysisId }, data: { status: 'error' } })
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
