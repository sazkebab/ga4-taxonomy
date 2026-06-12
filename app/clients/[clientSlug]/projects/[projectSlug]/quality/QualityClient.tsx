'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import SelectableReport from '../SelectableReport'
import QualitySettings from './QualitySettings'

interface ReportSummary { id: string; status: string; weekStart: Date; createdAt: Date; completedAt: Date | null }
interface Finding       { id: string; selection: string; action: string; response: string; status: string; createdAt: Date }
interface FullReport    { id: string; status: string; reportMarkdown: string; progressLog?: string; weekStart: Date; completedAt?: Date | null; findings: Finding[] }
interface Suppression   { id: string; content: string; label: string; isActive: boolean; createdAt: Date }
interface Prompt        { id: string; title: string; content: string; isActive: boolean; order: number }

// Progress is persisted server-side as a JSON array of completed tool calls
// so a polling client can show progress without a live SSE connection.
function parseProgressLog(raw: string | undefined): { name: string }[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

const POLL_INTERVAL_MS = 3000

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
  const [historyOpen,  setHistoryOpen] = useState(true)
  const [creating,     setCreating]    = useState(false)
  const [runError,     setRunError]    = useState<string | null>(null)

  async function deleteReport(reportId: string) {
    if (!confirm('Delete this report?')) return
    await fetch(`${apiBase}/quality/reports/${reportId}`, { method: 'DELETE' })
    setReports((prev) => prev.filter((r) => r.id !== reportId))
    if (report?.id === reportId) {
      setReport(null)
      router.push('?tab=report')
    }
  }

  // Sync report state when the server loads a different report (URL change) —
  // but not while we're actively polling a run for the current report.
  // Computed during render (React's "adjusting state when a prop changes"
  // pattern) rather than in a useEffect, to avoid an extra render pass.
  const [prevInitialReportId, setPrevInitialReportId] = useState(initialReport?.id)
  if (initialReport?.id !== prevInitialReportId) {
    setPrevInitialReportId(initialReport?.id)
    if (report?.status !== 'running') {
      setReport(initialReport)
    }
  }

  // Poll for progress/completion while a report is running in the background.
  // This covers both "I just kicked one off" and "I reopened this page while
  // one was already running".
  useEffect(() => {
    if (!report || report.status !== 'running') return
    const reportId = report.id
    let cancelled = false

    async function tick() {
      try {
        const res = await fetch(`${apiBase}/quality/reports/${reportId}`)
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (cancelled) return
        setReport((prev) => prev && prev.id === json.id ? { ...prev, ...json } : prev)
        if (json.status === 'complete' || json.status === 'error') {
          setReports((prev) => prev.map((r) => r.id === json.id ? { ...r, status: json.status, completedAt: json.completedAt } : r))
          router.refresh()
        }
      } catch { /* network blip — try again next tick */ }
    }

    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.status, report?.id, apiBase])

  async function runMonitor() {
    setCreating(true)
    setRunError(null)
    // Create report
    const res    = await fetch(`${apiBase}/quality/reports`, { method: 'POST' })
    const newRep = await res.json()
    setReports((prev) => [{ ...newRep, status: 'running' }, ...prev])
    setReport({ ...newRep, findings: [], reportMarkdown: '', progressLog: '[]', status: 'running' })
    setCreating(false)

    // Kick off the run in the background — it keeps going even if this tab
    // closes. The polling effect above takes over from here.
    try {
      const runRes = await fetch(`${apiBase}/quality/reports/${newRep.id}/run`, { method: 'POST' })
      const json   = await runRes.json().catch(() => null)
      if (!runRes.ok) {
        setRunError(json?.error ?? `Request failed (${runRes.status})`)
        setReport((prev) => prev && prev.id === newRep.id ? { ...prev, status: 'error', reportMarkdown: json?.error ? `⚠️ ${json.error}` : 'Failed to start' } : prev)
      }
    } catch {
      setRunError('Network error — could not reach the server')
      setReport((prev) => prev && prev.id === newRep.id ? { ...prev, status: 'error', reportMarkdown: '⚠️ Network error — could not reach the server' } : prev)
    }
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

  const isRunning      = report?.status === 'running'
  const toolsDone      = isRunning ? parseProgressLog(report?.progressLog) : []
  const displayMarkdown = report?.reportMarkdown || ''

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
          <Button onClick={runMonitor} disabled={isRunning || creating || !hasGa4} size="sm">
            {isRunning ? '⚡ Running…' : creating ? 'Creating…' : '▶ Run now'}
          </Button>
        </div>
      </div>

      {!hasGa4 && (
        <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-4 py-2.5">
          ⚠ No GA4 property configured — add one in <strong>GA4 Sync</strong> to enable monitoring.
        </div>
      )}

      {runError && (
        <div className="mb-4 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded px-4 py-2.5">
          ⚠️ {runError}
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
              <div
                key={r.id}
                className={[
                  'group w-full text-left rounded-md px-2.5 py-2 text-xs transition-colors border cursor-pointer',
                  report?.id === r.id ? 'bg-accent border-border' : 'border-transparent hover:bg-muted/40',
                ].join(' ')}
                onClick={() => router.push(`?report=${r.id}`)}
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="font-medium">
                    {new Date(r.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteReport(r.id) }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                    title="Delete report"
                  >
                    ✕
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.status === 'complete' ? '✓ Complete' : r.status === 'running' ? '⚡ Running' : r.status === 'error' ? '✗ Error' : '⏳ Pending'}
                </p>
              </div>
            ))}
          </aside>


          {/* Report content */}
          <div>
            {isRunning && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">
                  This runs in the background — feel free to navigate away. Come back anytime to see progress.
                </p>
                <div className="space-y-1.5">
                  {toolsDone.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="text-green-600">✓</span>
                      {TOOL_LABELS[t.name] ?? t.name}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="animate-pulse">⚡</span>
                    Working…
                  </div>
                </div>
              </div>
            )}

            {displayMarkdown ? (
              <SelectableReport
                markdown={displayMarkdown}
                findings={report?.findings ?? []}
                onFinding={onFinding}
                isRunning={isRunning}
              />
            ) : !isRunning ? (
              <div className="text-center py-20 text-muted-foreground">
                <p className="text-4xl mb-3">📊</p>
                <p className="font-medium">No report yet</p>
                <p className="text-sm mt-1">Click <strong>Run now</strong> to generate your first data quality report.</p>
                <p className="text-xs mt-3">The report checks core metrics, event inventory, key events, traffic sources and top pages — all compared week-over-week.</p>
              </div>
            ) : null}
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
