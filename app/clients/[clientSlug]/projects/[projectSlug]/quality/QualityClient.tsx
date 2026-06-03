'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import SelectableReport from './SelectableReport'
import QualitySettings from './QualitySettings'

interface ReportSummary { id: string; status: string; weekStart: Date; createdAt: Date; completedAt: Date | null }
interface Finding       { id: string; selection: string; action: string; response: string; status: string; createdAt: Date }
interface FullReport    { id: string; status: string; reportMarkdown: string; weekStart: Date; findings: Finding[] }
interface Suppression   { id: string; content: string; label: string; isActive: boolean; createdAt: Date }
interface Prompt        { id: string; title: string; content: string; isActive: boolean; order: number }

interface Props {
  projectId:     string
  apiBase:       string
  reports:       ReportSummary[]
  currentReport: FullReport | null
  suppressions:  Suppression[]
  prompts:       Prompt[]
  initialTab:    'report' | 'settings'
  hasGa4:        boolean
}

const TOOL_LABELS: Record<string, string> = {
  run_ga4_report:       'Running GA4 report',
  get_funnel_data:      'Analysing funnel',
  get_page_performance: 'Checking page performance',
  get_top_events:       'Getting top events',
  get_conversion_trend: 'Getting conversion trends',
  search_documents:     'Searching research',
}

function healthBadge(markdown: string) {
  if (markdown.includes('🔴 RED'))   return 'bg-red-100 text-red-700 border-red-200'
  if (markdown.includes('🟡 AMBER')) return 'bg-amber-100 text-amber-700 border-amber-200'
  if (markdown.includes('🟢 GREEN')) return 'bg-green-100 text-green-700 border-green-200'
  return 'bg-muted text-muted-foreground border-border'
}

function healthLabel(markdown: string) {
  if (markdown.includes('🔴 RED'))   return '🔴 RED'
  if (markdown.includes('🟡 AMBER')) return '🟡 AMBER'
  if (markdown.includes('🟢 GREEN')) return '🟢 GREEN'
  return 'Unknown'
}

export default function QualityClient({
  projectId, apiBase, reports: initialReports, currentReport: initialReport,
  suppressions: initialSuppressions, prompts: initialPrompts, initialTab, hasGa4,
}: Props) {
  const router = useRouter()
  const [tab,          setTab]         = useState<'report' | 'settings'>(initialTab)
  const [reports,      setReports]     = useState(initialReports)
  const [report,       setReport]      = useState(initialReport)
  const [suppressions, setSuppressions]= useState(initialSuppressions)
  const [prompts,      setPrompts]     = useState(initialPrompts)
  const [running,      setRunning]     = useState(false)
  const [streamText,   setStreamText]  = useState('')
  const [historyOpen,  setHistoryOpen] = useState(true)

  // Sync report state when the server loads a different report (URL change)
  useEffect(() => {
    if (!running) {
      setReport(initialReport)
      setStreamText('')
    }
  }, [initialReport?.id])
  const [activeTools,  setActiveTools] = useState<string[]>([])
  const [creating,     setCreating]    = useState(false)

  async function runMonitor() {
    setCreating(true)
    // Create report
    const res    = await fetch(`${apiBase}/quality/reports`, { method: 'POST' })
    const newRep = await res.json()
    setReports((prev) => [newRep, ...prev])
    setReport({ ...newRep, findings: [], reportMarkdown: '' })
    setStreamText('')
    setActiveTools([])
    setCreating(false)
    setRunning(true)

    // Run it
    const runRes = await fetch(`${apiBase}/quality/reports/${newRep.id}/run`, { method: 'POST' })
    if (!runRes.ok || !runRes.body) { setRunning(false); return }

    const reader  = runRes.body.getReader()
    const decoder = new TextDecoder()
    let   buffer  = ''
    let   fullMd  = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          if (event.type === 'text') {
            fullMd += event.delta
            setStreamText((t) => t + event.delta)
          } else if (event.type === 'tool_start') {
            setActiveTools((prev) => [...prev, event.name])
          } else if (event.type === 'tool_done') {
            setActiveTools((prev) => prev.filter((t) => t !== event.name))
          } else if (event.type === 'done') {
            setReport((prev) => prev ? { ...prev, status: 'complete', reportMarkdown: fullMd } : prev)
            setReports((prev) => prev.map((r) => r.id === newRep.id ? { ...r, status: 'complete' } : r))
            router.refresh()
          } else if (event.type === 'error') {
            setReport((prev) => prev ? { ...prev, status: 'error' } : prev)
          }
        } catch { /* ignore */ }
      }
    }
    setRunning(false)
  }

  async function onFinding(selection: string, action: 'suppress' | 'drilldown') {
    const res  = await fetch(`${apiBase}/quality/reports/${report!.id}/findings`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ selection, action }),
    })
    const data = await res.json()

    if (action === 'suppress') {
      // Add to suppressions list
      const newSup = { id: Date.now().toString(), content: selection, label: selection.slice(0, 60), isActive: true, createdAt: new Date() }
      setSuppressions((prev) => [newSup, ...prev])
    } else {
      // Update report's findings with drilldown response
      setReport((prev) => prev ? {
        ...prev,
        findings: [...(prev.findings ?? []), data.finding],
      } : prev)
    }
  }

  const displayMarkdown = streamText || report?.reportMarkdown || ''

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Data Quality</h2>
          <p className="text-sm text-muted-foreground mt-1">Weekly GA4 health monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={tab === 'report'   ? 'default' : 'outline'} size="sm"
            onClick={() => { setTab('report');   router.push('?tab=report') }}
          >
            📊 Report
          </Button>
          <Button
            variant={tab === 'settings' ? 'default' : 'outline'} size="sm"
            onClick={() => { setTab('settings'); router.push('?tab=settings') }}
          >
            ⚙️ Settings
          </Button>
          <Button onClick={runMonitor} disabled={running || creating || !hasGa4} size="sm">
            {running ? '⚡ Running…' : creating ? 'Creating…' : '▶ Run now'}
          </Button>
        </div>
      </div>

      {!hasGa4 && (
        <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-4 py-2.5">
          ⚠ No GA4 property configured — add one in <strong>GA4 Sync</strong> to enable monitoring.
        </div>
      )}

      {tab === 'report' && (
        <div className={`grid grid-cols-1 gap-6 ${historyOpen ? 'xl:grid-cols-[200px_1fr]' : 'xl:grid-cols-[auto_1fr]'}`}>
          {/* Report history */}
          <aside className="space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              {historyOpen && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">History</p>
              )}
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
                title={historyOpen ? 'Collapse history' : 'Expand history'}
              >
                {historyOpen ? '◀' : '▶'}
              </button>
            </div>
            {historyOpen && reports.length === 0 && (
              <p className="text-xs text-muted-foreground">No reports yet</p>
            )}
            {historyOpen && reports.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`?report=${r.id}`)}
                className={[
                  'w-full text-left rounded-md px-2.5 py-2 text-xs transition-colors border',
                  report?.id === r.id ? 'bg-accent border-border' : 'border-transparent hover:bg-muted/40',
                ].join(' ')}
              >
                <p className="font-medium">
                  {new Date(r.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })}
                </p>
                <p className={`mt-0.5 text-xs px-1.5 py-0.5 rounded inline-block border ${healthBadge(r.status === 'complete' ? (reports.find(x => x.id === r.id) ? '' : '') : '')}`}>
                  {r.status === 'complete' ? '✓ Complete' : r.status === 'running' ? '⚡ Running' : r.status === 'error' ? '✗ Error' : '⏳ Pending'}
                </p>
              </button>
            ))}
          </aside>


          {/* Report content */}
          <div>
            {running && (
              <div className="mb-4 space-y-1.5">
                {activeTools.map((t) => (
                  <div key={t} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="animate-pulse">⚡</span>
                    {TOOL_LABELS[t] ?? t}…
                  </div>
                ))}
              </div>
            )}

            {displayMarkdown ? (
              <SelectableReport
                markdown={displayMarkdown}
                findings={report?.findings ?? []}
                onFinding={onFinding}
                isRunning={running}
              />
            ) : (
              <div className="text-center py-20 text-muted-foreground">
                <p className="text-4xl mb-3">📊</p>
                <p className="font-medium">No report yet</p>
                <p className="text-sm mt-1">Click <strong>Run now</strong> to generate your first data quality report.</p>
                <p className="text-xs mt-3">The report checks core metrics, event inventory, key events, traffic sources and top pages — all compared week-over-week.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <QualitySettings
          apiBase={apiBase}
          prompts={prompts}
          suppressions={suppressions}
          onPromptsChange={setPrompts}
          onSuppressionsChange={setSuppressions}
        />
      )}
    </div>
  )
}
