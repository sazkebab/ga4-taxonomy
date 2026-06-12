'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import ChatInterface from './ChatInterface'
import DocumentLibrary from './DocumentLibrary'
import GuidedAnalysisWizard from './GuidedAnalysisWizard'

interface Chat           { id: string; title: string; updatedAt: Date }
interface Document       { id: string; title: string; sourceType: string; source: string; createdAt: Date; content: string }
interface GuidedSummary  { id: string; status: string; coreQuestion: string; useCase: string; updatedAt: Date }
interface Message        { id: string; role: string; content: string; toolCalls: { name: string; summary: string }[]; createdAt: Date }
interface Finding        {
  id:           string
  selection:    string
  action:       string
  response:     string
  status:       string
  conversation?: string
  proposedText?: string
  applied?:      boolean
}
interface GuidedAnalysis {
  id: string; status: string; coreQuestion: string; useCase: string
  stakeholderName: string; stakeholderLiteracy: string
  keyKpis: string[]; insightDestination: string; preferredOutputStyle: string
  priorKnowledge: string; subQuestions: string[]
  hypotheses: { question: string; hypothesis: string }[]
  reportMarkdown: string
  progressLog: string
  findings: Finding[]
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
  const [tab,          setTab]      = useState<'chat' | 'guided' | 'research'>(initialTab)
  const [chats,        setChats]    = useState(initialChats)
  const [docs,         setDocs]     = useState(initialDocs)
  const [guided,       setGuided]   = useState(initialGuided)
  const [creating,     setCreating] = useState(false)
  const [sidebarOpen,  setSidebarOpen] = useState(true)

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

  async function renameChat(chatId: string, title: string) {
    await fetch(`${apiBase}/analysis/chats/${chatId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, title } : c))
  }

  async function renameGuided(id: string, title: string) {
    await fetch(`${apiBase}/analysis/guided/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coreQuestion: title }),
    })
    setGuided((prev) => prev.map((g) => g.id === id ? { ...g, coreQuestion: title } : g))
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-10'} flex-none border-r flex flex-col bg-muted/20 transition-all duration-200`}>
        {/* Collapse toggle */}
        <div className={`flex items-center border-b ${sidebarOpen ? 'px-2 py-1.5' : 'justify-center py-2'}`}>
          {sidebarOpen && <span className="flex-1 text-xs font-medium text-muted-foreground">Analysis</span>}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors p-1"
            title={sidebarOpen ? 'Collapse panel' : 'Expand panel'}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* All sidebar content — only shown when expanded */}
        {sidebarOpen && <>
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
                <RenameableItem
                  key={chat.id}
                  label={chat.title}
                  isActive={currentChatId === chat.id}
                  onClick={() => router.push(`?tab=chat&chat=${chat.id}`)}
                  onRename={(t) => renameChat(chat.id, t)}
                  onDelete={() => deleteChat(chat.id)}
                />
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
                <RenameableItem
                  key={g.id}
                  label={g.coreQuestion || 'New analysis'}
                  isActive={currentGuidedId === g.id}
                  onClick={() => router.push(`?tab=guided&chat=${g.id}`)}
                  onRename={(t) => renameGuided(g.id, t)}
                  onDelete={() => deleteGuided(g.id)}
                  badge={
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[g.status] ?? ''}`}>
                        {g.status}
                      </span>
                      {(() => {
                        try {
                          const keys: string[] = JSON.parse(g.useCase || '[]')
                          return keys.slice(0, 2).map((k) => (
                            <span key={k} className="text-xs text-muted-foreground">{USE_CASE_LABELS[k] ?? ''}</span>
                          ))
                        } catch {
                          return g.useCase ? <span className="text-xs text-muted-foreground">{USE_CASE_LABELS[g.useCase] ?? ''}</span> : null
                        }
                      })()}
                    </div>
                  }
                />
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
        </>}
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

// ─── RenameableItem ───────────────────────────────────────────────────────────

function RenameableItem({
  label, isActive, onClick, onRename, onDelete, badge,
}: {
  label:    string
  isActive: boolean
  onClick:  () => void
  onRename: (title: string) => void
  onDelete: () => void
  badge?:   React.ReactNode
}) {
  const [editing,  setEditing]  = useState(false)
  const [value,    setValue]    = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setValue(label)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit() {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed && trimmed !== label) onRename(trimmed)
    else setValue(label)
  }

  if (editing) {
    return (
      <div className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        {badge && <div className="mb-1">{badge}</div>}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setValue(label) } }}
          className="w-full text-xs bg-background border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    )
  }

  return (
    <div
      className={['group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer transition-colors', isActive ? 'bg-accent' : 'hover:bg-accent/50'].join(' ')}
      onClick={onClick}
    >
      {badge && <span className="shrink-0">{badge}</span>}
      <span className="flex-1 text-xs truncate">{label}</span>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
        <button onClick={startEdit} className="text-muted-foreground hover:text-foreground text-xs px-1" title="Rename">✎</button>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-muted-foreground hover:text-destructive text-xs px-1" title="Delete">✕</button>
      </div>
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
