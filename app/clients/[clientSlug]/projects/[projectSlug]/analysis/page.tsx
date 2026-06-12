import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { resolveProject } from '@/lib/resolve-route'
import AnalysisClient from './AnalysisClient'

export default async function AnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string; projectSlug: string }>
  searchParams: Promise<{ chat?: string; tab?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) notFound()

  const { clientSlug, projectSlug } = await params
  const { chat: chatId, tab } = await searchParams
  const { project, apiBase } = await resolveProject(clientSlug, projectSlug, session.user.id)

  const [chats, documents, guidedAnalyses] = await Promise.all([
    db.analysisChat.findMany({
      where: { projectId: project.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true },
    }),
    db.analysisDocument.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, sourceType: true, source: true, createdAt: true, content: true },
    }),
    db.guidedAnalysis.findMany({
      where: { projectId: project.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true, coreQuestion: true, useCase: true, updatedAt: true },
    }),
  ])

  // Load current chat messages if a chat is selected
  const currentMessages = chatId
    ? await db.analysisMessage.findMany({
        where: { chatId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, content: true, toolCalls: true, createdAt: true },
      })
    : []

  // Load current guided analysis if selected
  const currentGuided = tab === 'guided' && chatId
    ? await db.guidedAnalysis.findUnique({
        where: { id: chatId },
        include: { findings: { orderBy: { createdAt: 'asc' } } },
      })
    : null

  const hasGa4 = !!project.ga4PropertyId

  const resolvedTab = tab === 'research' ? 'research' : tab === 'guided' ? 'guided' : 'chat'

  return (
    <AnalysisClient
      projectId={project.id}
      apiBase={apiBase}
      chats={chats}
      documents={documents}
      guidedAnalyses={guidedAnalyses}
      currentChatId={resolvedTab === 'chat' ? (chatId ?? null) : null}
      currentGuidedId={resolvedTab === 'guided' ? (chatId ?? null) : null}
      currentMessages={currentMessages.map((m) => ({
        ...m,
        toolCalls: JSON.parse(m.toolCalls ?? '[]'),
      }))}
      currentGuided={currentGuided ? {
        ...currentGuided,
        keyKpis:      JSON.parse(currentGuided.keyKpis),
        subQuestions: JSON.parse(currentGuided.subQuestions),
        hypotheses:   JSON.parse(currentGuided.hypotheses),
      } : null}
      initialTab={resolvedTab as 'chat' | 'guided' | 'research'}
      hasGa4={hasGa4}
    />
  )
}
