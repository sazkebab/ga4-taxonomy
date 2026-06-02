import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { streamAnalysis } from '@/lib/analysisAgent'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; chatId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { projectId, chatId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) }

  const { message } = await req.json()
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamAnalysis(projectId, session.user!.id!, chatId, message)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
      } catch (err) {
        const errEvent = { type: 'error', message: String(err) }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errEvent)}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
