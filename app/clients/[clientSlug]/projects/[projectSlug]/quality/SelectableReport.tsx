'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'

interface Finding { id: string; selection: string; action: string; response: string; status: string }

interface Props {
  markdown:   string
  findings:   Finding[]
  onFinding:  (selection: string, action: 'suppress' | 'drilldown') => Promise<void>
  isRunning:  boolean
}

interface Tooltip { text: string; x: number; y: number }

export default function SelectableReport({ markdown, findings, onFinding, isRunning }: Props) {
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
          className="fixed z-50 flex items-center gap-1 bg-popover border rounded-lg shadow-lg px-2 py-1.5"
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px`, transform: 'translate(-50%, -100%)' }}
        >
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => act('suppress')} disabled={!!loading}>
            🚫 {loading === 'suppress' ? 'Saving…' : 'Ignore this'}
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => act('drilldown')} disabled={!!loading}>
            🔍 {loading === 'drilldown' ? 'Analysing…' : 'Tell me more'}
          </Button>
        </div>
      )}

      {/* Legend */}
      {(suppressed.length > 0 || drilldowns.length > 0) && (
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">
          {suppressed.length > 0 && (
            <span>🚫 <span className="line-through opacity-50">strikethrough</span> = suppressed</span>
          )}
          {drilldowns.length > 0 && (
            <span>🔍 <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">1</span> = click to see detail →</span>
          )}
        </div>
      )}

      {/* Two-column layout: report + drill-down panel */}
      <div className={drilldowns.length > 0 ? `grid grid-cols-1 gap-6 items-start ${drillsVisible ? 'xl:grid-cols-[1fr_300px]' : 'xl:grid-cols-[1fr_auto]'}` : ''}>
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
          "{finding.selection.slice(0, 100)}{finding.selection.length > 100 ? '…' : ''}"
        </span>
        <span className="ml-2 text-xs text-muted-foreground">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-4 py-3 border-t">
          <MarkdownRenderer markdown={finding.response} suppressedSet={new Set()} drilldownIndex={new Map()} />
        </div>
      )}
    </div>
  )
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownRenderer({
  markdown,
  suppressedSet,
  drilldownIndex,
}: {
  markdown:       string
  suppressedSet:  Set<string>
  drilldownIndex: Map<string, number>
}) {
  const lines    = markdown.split('\n')
  const elements: React.ReactNode[] = []
  let i   = 0
  let key = 0

  // Check if a line of text should be suppressed or has a drill-down
  function lineClass(text: string): string {
    for (const s of suppressedSet) {
      if (text.includes(s)) return 'line-through opacity-40'
    }
    return ''
  }

  function drillMarker(text: string): React.ReactNode | null {
    for (const [sel, idx] of drilldownIndex) {
      if (text.includes(sel)) {
        return (
          <button
            className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold ml-1.5 hover:opacity-80 transition-opacity"
            title={`Click to see drill-down #${idx}`}
            onClick={() => {
              const el = document.getElementById(`drilldown-${idx}`)
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                // Dispatch a custom event so the panel expands
                el.dispatchEvent(new CustomEvent('expand-drilldown', { bubbles: true }))
              }
            }}
          >
            {idx}
          </button>
        )
      }
    }
    return null
  }

  while (i < lines.length) {
    const line = lines[i]

    // Headings
    if (line.startsWith('### ')) {
      const text = line.slice(4)
      elements.push(<h3 key={key++} className={`text-base font-semibold mt-5 mb-2 ${lineClass(text)}`}>{renderInline(text)}{drillMarker(text)}</h3>)
    } else if (line.startsWith('## ')) {
      const text = line.slice(3)
      elements.push(<h2 key={key++} className={`text-lg font-semibold mt-6 mb-2 border-b pb-1 ${lineClass(text)}`}>{renderInline(text)}{drillMarker(text)}</h2>)
    } else if (line.startsWith('# ')) {
      const text = line.slice(2)
      elements.push(<h1 key={key++} className={`text-xl font-bold mt-4 mb-3 ${lineClass(text)}`}>{renderInline(text)}{drillMarker(text)}</h1>)

    // Horizontal rule
    } else if (line.trim() === '---' || line.trim() === '***') {
      elements.push(<hr key={key++} className="my-4 border-muted" />)

    // Bullet lists
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: { text: string }[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push({ text: lines[i].slice(2) })
        i++
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-2 text-sm">
          {items.map((item, j) => (
            <li key={j} className={lineClass(item.text)}>
              {renderInline(item.text)}{drillMarker(item.text)}
            </li>
          ))}
        </ul>
      )
      continue

    // Numbered lists → render as bullets
    } else if (/^\d+\. /.test(line)) {
      const items: { text: string }[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push({ text: lines[i].replace(/^\d+\. /, '') })
        i++
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-2 text-sm">
          {items.map((item, j) => (
            <li key={j} className={lineClass(item.text)}>
              {renderInline(item.text)}{drillMarker(item.text)}
            </li>
          ))}
        </ul>
      )
      continue

    // Tables
    } else if (line.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim())
        // Skip separator rows like |---|---|
        if (!cells.every((c) => /^[-: ]+$/.test(c))) {
          rows.push(cells)
        }
        i++
      }
      if (rows.length > 0) {
        const [header, ...body] = rows
        elements.push(
          <div key={key++} className="overflow-x-auto my-3">
            <table className="w-full text-sm border-collapse border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-muted/50">
                  {header.map((cell, j) => (
                    <th key={j} className="border px-3 py-2 text-left font-semibold text-xs">
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} className="border-b hover:bg-muted/20">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`border px-3 py-2 text-xs ${lineClass(cell)}`}>
                        {renderInline(cell)}{drillMarker(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue

    // Code blocks
    } else if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      elements.push(
        <pre key={key++} className="bg-muted rounded p-3 text-xs font-mono overflow-x-auto my-3">
          {codeLines.join('\n')}
        </pre>
      )

    // Health rating callout
    } else if (line.startsWith('**Overall health') || line.includes('🟢') || line.includes('🟡') || line.includes('🔴')) {
      elements.push(
        <div key={key++} className="my-3 p-3 rounded-lg bg-muted/30 border font-semibold text-sm">
          {renderInline(line)}{drillMarker(line)}
        </div>
      )

    // Italic disclaimer lines
    } else if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      const text = line.slice(1, -1)
      elements.push(
        <p key={key++} className="text-xs text-muted-foreground italic mt-4 border-t pt-3">
          {text}
        </p>
      )

    // Empty line
    } else if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />)

    // Normal paragraph
    } else {
      const text = line
      elements.push(
        <p key={key++} className={`text-sm leading-relaxed my-1 ${lineClass(text)}`}>
          {renderInline(text)}{drillMarker(text)}
        </p>
      )
    }
    i++
  }

  return <>{elements}</>
}

function renderInline(text: string): React.ReactNode {
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
