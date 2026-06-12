// Hand-rolled markdown → JSX renderer for AI-generated reports and chat
// messages. Handles the subset of markdown Claude commonly produces:
// headings (#### through #), horizontal rules, nested bullet/numbered
// lists, tables, code blocks, health-rating callouts (🟢🟡🔴), italic
// disclaimer lines, inline **bold** / `code` / [links](url), and paragraphs.

interface Props {
  markdown: string
  // Optional — only used by SelectableReport for highlight-to-drilldown.
  // Plain chat/report rendering doesn't need these.
  suppressedSet?:  Set<string>
  drilldownIndex?: Map<string, number>
}

const EMPTY_SET = new Set<string>()
const EMPTY_MAP = new Map<string, number>()

export function MarkdownRenderer({ markdown, suppressedSet = EMPTY_SET, drilldownIndex = EMPTY_MAP }: Props) {
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
    if (line.startsWith('#### ')) {
      const text = line.slice(5)
      elements.push(<h4 key={key++} className={`text-sm font-semibold mt-4 mb-1.5 ${lineClass(text)}`}>{renderInline(text)}{drillMarker(text)}</h4>)
    } else if (line.startsWith('### ')) {
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

    // Bullet & numbered lists — including nested/indented items. Claude
    // commonly indents sub-points under a top-level bullet (e.g. "  - ...");
    // without this, those lines fell through to plain paragraphs and showed
    // their raw "- " / "1. " markers.
    } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const items: { text: string; indent: number }[] = []
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s(.*)$/)
        if (!m) break
        items.push({ text: m[3], indent: Math.floor(m[1].length / 2) })
        i++
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-2 text-sm">
          {items.map((item, j) => (
            <li
              key={j}
              className={lineClass(item.text)}
              style={item.indent ? { marginLeft: `${item.indent * 1.25}rem` } : undefined}
            >
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
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      return <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-primary underline">{linkMatch[1]}</a>
    }
    return part
  })
}
