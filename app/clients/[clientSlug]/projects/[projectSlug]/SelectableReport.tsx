'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from './MarkdownRenderer'

interface Finding { id: string; selection: string; action: string; response: string; status: string }

interface Props {
  markdown:     string
  findings:     Finding[]
  onFinding:    (selection: string, action: 'suppress' | 'drilldown') => Promise<void>
  isRunning:    boolean
  // Some reports (e.g. guided analyses) don't have a "suppress for future runs"
  // concept — set to false to only offer the "Tell me more" drill-down action.
  showSuppress?: boolean
}

interface Tooltip { text: string; x: number; y: number }

export default function SelectableReport({ markdown, findings, onFinding, isRunning, showSuppress = true }: Props) {
  const [tooltip,       setTooltip]      = useState<Tooltip | null>(null)
  const [loading,       setLoading]      = useState<'suppress' | 'drilldown' | null>(null)
  const [expanded,      setExpanded]     = useState<Set<string>>(new Set())
  const [drillsVisible, setDrillsVisible]= useState(true)

  const suppressed  = findings.filter((f) => f.action === 'suppress')
  const drilldowns  = findings.filter((f) => f.action === 'drilldown' && f.status === 'complete')

  // Map selection text → drill-down index (1-based) for footnote markers
  const drilldownIndex = new Map(drilldowns.map((f, i) => [f.selection, i + 1]))
  const suppressedSet  = new Set(suppressed.map((f) => f.selection))

  const handleMouseUp = useCallback(() => {
    if (isRunning) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { setTooltip(null); return }
    const text = sel.toString().trim()
    if (text.length < 10) { setTooltip(null); return }
    try {
      const range = sel.getRangeAt(0)
      const rect  = range.getBoundingClientRect()
      setTooltip({ text, x: rect.left + rect.width / 2, y: rect.top + window.scrollY - 8 })
    } catch { setTooltip(null) }
  }, [isRunning])

  useEffect(() => {
    const dismiss = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-tooltip]')) setTooltip(null)
    }
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [])

  // When printing/exporting to PDF, expand every drill-down so the full
  // report — including drilled-into detail — ends up in the PDF.
  useEffect(() => {
    const expandForPrint = () => {
      setDrillsVisible(true)
      setExpanded(new Set(drilldowns.map((f) => f.id)))
    }
    window.addEventListener('beforeprint', expandForPrint)
    return () => window.removeEventListener('beforeprint', expandForPrint)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findings])

  async function act(action: 'suppress' | 'drilldown') {
    if (!tooltip) return
    setLoading(action)
    await onFinding(tooltip.text, action)
    setTooltip(null)
    setLoading(null)
  }

  return (
    <div className="relative">
      {/* Floating selection tooltip */}
      {tooltip && (
        <div
          data-tooltip
          data-print-hide
          className="fixed z-50 flex items-center gap-1 bg-popover border rounded-lg shadow-lg px-2 py-1.5"
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px`, transform: 'translate(-50%, -100%)' }}
        >
          {showSuppress && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => act('suppress')} disabled={!!loading}>
              🚫 {loading === 'suppress' ? 'Saving…' : 'Ignore this'}
            </Button>
          )}
          <Button size="sm" className="h-7 text-xs" onClick={() => act('drilldown')} disabled={!!loading}>
            🔍 {loading === 'drilldown' ? 'Analysing…' : 'Tell me more'}
          </Button>
        </div>
      )}

      {/* Legend */}
      {(suppressed.length > 0 || drilldowns.length > 0) && (
        <div data-print-hide className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">
          {suppressed.length > 0 && (
            <span>🚫 <span className="line-through opacity-50">strikethrough</span> = suppressed</span>
          )}
          {drilldowns.length > 0 && (
            <span>🔍 <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">1</span> = click to see detail →</span>
          )}
        </div>
      )}

      {/* Two-column layout: report + drill-down panel */}
      <div className={drilldowns.length > 0 ? `report-grid grid grid-cols-1 gap-6 items-start ${drillsVisible ? 'xl:grid-cols-[1fr_300px]' : 'xl:grid-cols-[1fr_auto]'}` : ''}>
        {/* Report */}
        <div onMouseUp={handleMouseUp} className="select-text min-w-0">
          <MarkdownRenderer
            markdown={markdown}
            suppressedSet={suppressedSet}
            drilldownIndex={drilldownIndex}
          />
        </div>

        {/* Drill-down sidebar */}
        {drilldowns.length > 0 && (
          <div className="sticky top-6 space-y-3">
            <div className="flex items-center gap-2">
              {drillsVisible && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">🔍 Drill-downs</p>
              )}
              <button
                data-print-hide
                onClick={() => setDrillsVisible((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1 ml-auto"
                title={drillsVisible ? 'Collapse' : 'Expand drill-downs'}
              >
                {drillsVisible ? '▶' : '◀'}
              </button>
            </div>
            {drillsVisible && drilldowns.map((f, i) => (
              <DrillDownPanel
                key={f.id}
                finding={f}
                index={i + 1}
                expanded={expanded.has(f.id)}
                onToggle={() => setExpanded((prev) => {
                  const next = new Set(prev)
                  next.has(f.id) ? next.delete(f.id) : next.add(f.id)
                  return next
                })}
                onExpand={() => setExpanded((prev) => new Set([...prev, f.id]))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── DrillDownPanel ──────────────────────────────────────────────────────────

function DrillDownPanel({ finding, index, expanded, onToggle, onExpand }: {
  finding:  Finding
  index:    number
  expanded: boolean
  onToggle: () => void
  onExpand: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = () => {
      onExpand()
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    el.addEventListener('expand-drilldown', handler)
    return () => el.removeEventListener('expand-drilldown', handler)
  }, [onExpand])

  return (
    <div ref={ref} id={`drilldown-${index}`} className="border rounded-lg overflow-hidden scroll-mt-4">
      <button
        className="w-full text-left px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors"
        onClick={onToggle}
      >
        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-bold mr-2">{index}</span>
        <span className="text-sm text-muted-foreground italic">
          &ldquo;{finding.selection.slice(0, 100)}{finding.selection.length > 100 ? '…' : ''}&rdquo;
        </span>
        <span className="ml-2 text-xs text-muted-foreground">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-4 py-3 border-t">
          <MarkdownRenderer markdown={finding.response} />
        </div>
      )}
    </div>
  )
}
