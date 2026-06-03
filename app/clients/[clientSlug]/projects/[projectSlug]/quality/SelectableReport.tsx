'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'

interface Finding { id: string; selection: string; action: string; response: string; status: string }

interface Props {
  markdown:   string
  findings:   Finding[]
  onFinding:  (selection: string, action: 'suppress' | 'drilldown') => Promise<void>
  isRunning:  boolean
}

interface Tooltip {
  text: string
  x:    number
  y:    number
}

export default function SelectableReport({ markdown, findings, onFinding, isRunning }: Props) {
  const containerRef          = useRef<HTMLDivElement>(null)
  const [tooltip,  setTooltip]  = useState<Tooltip | null>(null)
  const [loading,  setLoading]  = useState<'suppress' | 'drilldown' | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const handleMouseUp = useCallback(() => {
    if (isRunning) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setTooltip(null)
      return
    }
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

  async function act(action: 'suppress' | 'drilldown') {
    if (!tooltip) return
    setLoading(action)
    await onFinding(tooltip.text, action)
    setTooltip(null)
    setLoading(null)
  }

  // Find drilldown findings that match selections in the report
  const drilldowns = findings.filter((f) => f.action === 'drilldown' && f.status === 'complete')
  const suppressed = findings.filter((f) => f.action === 'suppress')

  return (
    <div className="relative">
      {/* Floating tooltip */}
      {tooltip && (
        <div
          data-tooltip
          className="fixed z-50 flex items-center gap-1 bg-popover border rounded-lg shadow-lg px-2 py-1.5"
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px`, transform: 'translate(-50%, -100%)' }}
        >
          <Button
            size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => act('suppress')}
            disabled={!!loading}
          >
            🚫 {loading === 'suppress' ? 'Saving…' : 'Ignore this'}
          </Button>
          <Button
            size="sm" className="h-7 text-xs gap-1"
            onClick={() => act('drilldown')}
            disabled={!!loading}
          >
            🔍 {loading === 'drilldown' ? 'Analysing…' : 'Tell me more'}
          </Button>
        </div>
      )}

      {/* Suppression note */}
      {suppressed.length > 0 && (
        <div className="mb-3 text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">
          🚫 {suppressed.length} finding{suppressed.length !== 1 ? 's' : ''} suppressed from this report. Manage in Settings → Suppressions.
        </div>
      )}

      {/* Report */}
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className="prose prose-sm max-w-none select-text"
        style={{ userSelect: 'text' }}
      >
        <MarkdownRenderer markdown={markdown} />
      </div>

      {/* Drill-down responses */}
      {drilldowns.length > 0 && (
        <div className="mt-8 space-y-4">
          <h3 className="font-semibold text-sm border-t pt-4">🔍 Drill-down findings</h3>
          {drilldowns.map((f) => (
            <div key={f.id} className="border rounded-lg overflow-hidden">
              <button
                className="w-full text-left px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors text-sm"
                onClick={() => setExpanded((prev) => {
                  const next = new Set(prev)
                  next.has(f.id) ? next.delete(f.id) : next.add(f.id)
                  return next
                })}
              >
                <span className="font-medium">Selected: </span>
                <span className="text-muted-foreground italic">"{f.selection.slice(0, 100)}{f.selection.length > 100 ? '…' : ''}"</span>
                <span className="ml-2 text-xs text-muted-foreground">{expanded.has(f.id) ? '▲' : '▼'}</span>
              </button>
              {expanded.has(f.id) && (
                <div className="px-4 py-3 prose prose-sm max-w-none">
                  <MarkdownRenderer markdown={f.response} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Simple markdown renderer ─────────────────────────────────────────────────
// Handles the common patterns in monitoring reports without a heavy dependency

function MarkdownRenderer({ markdown }: { markdown: string }) {
  const lines    = markdown.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-base font-semibold mt-5 mb-2">{renderInline(line.slice(4))}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-lg font-semibold mt-6 mb-2 border-b pb-1">{renderInline(line.slice(3))}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-xl font-bold mt-4 mb-3">{renderInline(line.slice(2))}</h1>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      // Collect list items
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={i} className="list-disc list-inside space-y-1 my-2 text-sm">
          {items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ul>
      )
      continue
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''))
        i++
      }
      elements.push(
        <ol key={i} className="list-decimal list-inside space-y-1 my-2 text-sm">
          {items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ol>
      )
      continue
    } else if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={i} className="bg-muted rounded p-3 text-xs font-mono overflow-x-auto my-3">
          {codeLines.join('\n')}
        </pre>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    } else if (line.startsWith('**Overall health')) {
      elements.push(
        <div key={i} className="my-3 p-3 rounded-lg bg-muted/30 border font-semibold text-sm">
          {renderInline(line)}
        </div>
      )
    } else {
      elements.push(<p key={i} className="text-sm leading-relaxed my-1">{renderInline(line)}</p>)
    }
    i++
  }

  return <>{elements}</>
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold**, `code`, and emoji health indicators
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>
    }
    return part
  })
}
