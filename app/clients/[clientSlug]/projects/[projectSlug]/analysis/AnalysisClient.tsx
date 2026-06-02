'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import ChatInterface from './ChatInterface'
import DocumentLibrary from './DocumentLibrary'
import GuidedAnalysisWizard from './GuidedAnalysisWizard'

interface Chat           { id: string; title: string; updatedAt: Date }
interface Document       { id: string; title: string; sourceType: string; source: string; createdAt: Date; content: string }
interface GuidedSummary  { id: string; status: string; coreQuestion: string; useCase: string; updatedAt: Date }
interface Message        { id: string; role: string; content: string; toolCalls: { name: string; summary: string }[]; createdAt: Date }
interface GuidedAnalysis {
  id: string; status: string; coreQuestion: string; useCase: string
  stakeholderName: string; stakeholderLiteracy: string
  keyKpis: string[]; insightDestination: string; preferredOutputStyle: string
  priorKnowledge: string; subQuestions: string[]
  hypotheses: { question: string; hypothesis: string }[]
  reportMarkdown: string
}

interface Props {
  projectId:       string
  apiBase:         string
  chats:           Chat[]
  documents:       Document[]
  guidedAnalyses:  GuidedSummary[]
  currentChatId:   string | null
  currentGuidedId: string | null
  currentMessages: Message[]
  currentGuided:   GuidedAnalysis | null
  initialTab:      'chat' | 'guided' | 'research'
  hasGa4:          boolean
}

const USE_CASE_LABELS: Record<string, string> = {
  inform_ux_design:    'UX design',
  run_experiments:     'Experiments',
  change_campaigns:    'Campaigns',
  email_customers:     'Email',
  build_business_case: 'Business case',
}

const STATUS_BADGE: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-600',
  running:  'bg-blue-100 text-blue-600',
  complete: 'bg-green-100 text-green-700',
  error:    'bg-red-100 text-red-600',
}

export default function AnalysisClient({
  projectId, apiBase, chats: initialChats, documents: initialDocs,
  guidedAnalyses: initialGuided, currentChatId, currentGuidedId,
  currentMessages, currentGuided, initialTab, hasGa4,
}: Props) {
  const router = useRouter()
  const [tab,          setTab]    = useState<'chat' | 'guided' | 'research'>(initialTab)
  const [chats,        setChats]  = useState(initialChats)
  const [docs,         setDocs]   = useState(initialDocs)
  const [guided,       setGuided] = useState(initialGuided)
  const [creating,     setCreating] = useState(false)

  function switchTab(t: 'chat' | 'guided' | 'research') {
    setTab(t)
    router.push(`?tab=${t}`)
  }

  async function newChat() {
    setCreating(true)
    try {
      const res  = await fetch(`${apiBase}/analysis/chats`, { method: 'POST' })
      const chat = await res.json()
      setChats((prev) => [chat, ...prev])
      router.push(`?tab=chat&chat=${chat.id}`)
    } finally { setCreating(false) }
  }

  async function deleteChat(chatId: string) {
    if (!confirm('Delete this chat?')) return
    await fetch(`${apiBase}/analysis/chats`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId }),
    })
    setChats((prev) => prev.filter((c) => c.id !== chatId))
    if (currentChatId === chatId) router.push('?tab=chat')
  }

  async function newGuided() {
    setCreating(true)
    try {
      const res      = await fetch(`${apiBase}/analysis/guided`, { method: 'POST' })
      const analysis = await res.json()
      setGuided((prev) => [analysis, ...prev])
      router.push(`?tab=guided&chat=${analysis.id}`)
    } finally { setCreating(false) }
  }

  async function deleteGuided(id: string) {
    if (!confirm('Delete this analysis?')) return
    await fetch(`${apiBase}/analysis/guided/${id}`, { method: 'DELETE' })
    setGuided((prev) => prev.filter((g) => g.id !== id))
    if (currentGuidedId === id) router.push('?tab=guided')
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <aside className="w-64 flex-none border-r flex flex-col bg-muted/20">
        {/* Tabs */}
        <div className="flex border-b">
          {([
            { key: 'chat',     label: '💬', title: 'Chat' },
            { key: 'guided',   label: '🔬', title: 'Guided' },
            { key: 'research', label: '📚', title: 'Research' },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              title={t.title}
              className={[
                'flex-1 py-2.5 text-sm transition-colors',
                tab === t.key
                  ? 'bg-background border-b-2 border-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {t.label} {t.title}
            </button>
          ))}
        </div>

        {/* Chat list */}
        {tab === 'chat' && (
          <>
            <div className="p-3">
              <Button size="sm" className="w-full" onClick={newChat} disabled={creating}>
                {creating ? 'Creating…' : '+ New chat'}
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
              {chats.map((chat) => (
                <div key={chat.id}
                  className={['group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer transition-colors', currentChatId === chat.id ? 'bg-accent' : 'hover:bg-accent/50'].join(' ')}
                  onClick={() => router.push(`?tab=chat&chat=${chat.id}`)}>
                  <span className="flex-1 text-xs truncate">{chat.title}</span>
                  <button onClick={(e) => { e.stopPropagation(); deleteChat(chat.id) }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive text-xs px-1">✕</button>
                </div>
              ))}
              {chats.length === 0 && <p className="text-xs text-muted-foreground px-2 py-4 text-center">No chats yet</p>}
            </nav>
          </>
        )}

        {/* Guided list */}
        {tab === 'guided' && (
          <>
            <div className="p-3">
              <Button size="sm" className="w-full" onClick={newGuided} disabled={creating}>
                {creating ? 'Creating…' : '+ New analysis'}
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
              {guided.map((g) => (
                <div key={g.id}
                  className={['group rounded-md px-2 py-2 cursor-pointer transition-colors', currentGuidedId === g.id ? 'bg-accent' : 'hover:bg-accent/50'].join(' ')}
                  onClick={() => router.push(`?tab=guided&chat=${g.id}`)}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[g.status] ?? ''}`}>
                      {g.status}
                    </span>
                    {g.useCase && <span className="text-xs text-muted-foreground">{USE_CASE_LABELS[g.useCase] ?? ''}</span>}
                    <button onClick={(e) => { e.stopPropagation(); deleteGuided(g.id) }}
                      className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive text-xs">✕</button>
                  </div>
                  <p className="text-xs truncate">{g.coreQuestion || 'New analysis'}</p>
                </div>
              ))}
              {guided.length === 0 && <p className="text-xs text-muted-foreground px-2 py-4 text-center">No analyses yet</p>}
            </nav>
          </>
        )}

        {/* Research summary */}
        {tab === 'research' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            <p className="text-xs text-muted-foreground mb-2">{docs.length} document{docs.length !== 1 ? 's' : ''}</p>
            {docs.map((d) => (
              <div key={d.id} className="text-xs rounded border px-2 py-1.5 bg-background">
                <p className="font-medium truncate">{d.title}</p>
                <p className="text-muted-foreground capitalize">{d.sourceType.replace('_', ' ')}</p>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Main area */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {tab === 'chat' && (
          currentChatId ? (
            <ChatInterface
              apiBase={apiBase}
              chatId={currentChatId}
              initialMessages={currentMessages}
              hasGa4={hasGa4}
              onTitleUpdate={(title) => setChats((prev) => prev.map((c) => c.id === currentChatId ? { ...c, title } : c))}
            />
          ) : (
            <EmptyState
              icon="💬"
              title="Explore your data"
              desc="Ask anything about GA4 data, user behaviour, or conversions. Claude knows your full event taxonomy."
              action={<Button onClick={newChat} disabled={creating}>{creating ? 'Creating…' : '+ Start a new chat'}</Button>}
              warning={!hasGa4 ? '⚠ No GA4 property set — add one in GA4 Sync to enable data queries' : undefined}
            />
          )
        )}

        {tab === 'guided' && (
          currentGuidedId && currentGuided ? (
            <GuidedAnalysisWizard
              analysis={currentGuided}
              apiBase={apiBase}
              onComplete={(report) => setGuided((prev) => prev.map((g) => g.id === currentGuidedId ? { ...g, status: 'complete' } : g))}
              onStatusChange={(status) => setGuided((prev) => prev.map((g) => g.id === currentGuidedId ? { ...g, status } : g))}
            />
          ) : (
            <EmptyState
              icon="🔬"
              title="Guided analysis"
              desc="Answer a focused question with a structured report. Claude tests your hypotheses against real data and produces an evidence-based verdict."
              action={<Button onClick={newGuided} disabled={creating}>{creating ? 'Creating…' : '+ New analysis'}</Button>}
              warning={!hasGa4 ? '⚠ No GA4 property set — add one in GA4 Sync to enable data queries' : undefined}
            />
          )
        )}

        {tab === 'research' && (
          <DocumentLibrary
            apiBase={apiBase}
            docs={docs}
            onAdd={(doc) => setDocs((prev) => [doc, ...prev])}
            onDelete={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
          />
        )}
      </main>
    </div>
  )
}

function EmptyState({ icon, title, desc, action, warning }: {
  icon: string; title: string; desc: string; action: React.ReactNode; warning?: string
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
      <div className="text-4xl">{icon}</div>
      <div>
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{desc}</p>
        {warning && <p className="text-xs text-amber-600 mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">{warning}</p>}
      </div>
      {action}
    </div>
  )
}
