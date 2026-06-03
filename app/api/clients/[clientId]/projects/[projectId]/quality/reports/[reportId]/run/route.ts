import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { streamQualityMonitor } from '@/lib/qualityMonitorAgent'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })
  const { projectId, reportId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return new Response('Forbidden', { status: 403 }) }

  const report = await db.dataQualityReport.findUnique({ where: { id: reportId } })
  if (!report || report.projectId !== projectId) return new Response('Not found', { status: 404 })

  await db.dataQualityReport.update({ where: { id: reportId }, data: { status: 'running', reportMarkdown: '' } })

  const encoder = new TextEncoder()
  const stream  = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamQualityMonitor(reportId, projectId)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
      } catch (err) {
        await db.dataQualityReport.update({ where: { id: reportId }, data: { status: 'error' } })
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
