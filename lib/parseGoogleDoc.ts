/**
 * Parses a Google Docs API response into structured DataLayer sections.
 *
 * Handles two source formats:
 *  1. Docs exported by this app  (Courier New code, pipe-delimited param rows)
 *  2. Manually-created docs      (Courier New / monospace code, TABLE param rows)
 *
 * Returns one ParsedSection per HEADING_2 / HEADING_3 found.
 */
import type { docs_v1 } from 'googleapis'

type GDoc   = docs_v1.Schema$Document
type StructEl = docs_v1.Schema$StructuralElement
type Para   = docs_v1.Schema$Paragraph
type Table  = docs_v1.Schema$Table

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ParsedParam {
  name:    string
  example: string
  notes:   string
}

export interface ParsedSection {
  eventName: string    // raw heading text — caller normalises
  trigger:   string
  codeBlock: string
  params:    ParsedParam[]
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function parseGoogleDoc(doc: GDoc): ParsedSection[] {
  const elements = doc.body?.content ?? []

  const sections: ParsedSection[] = []
  let cur: ParsedSection | null  = null
  const codeBuf: string[]        = []
  let inCode                     = false

  function flushCode() {
    if (cur && codeBuf.length > 0) {
      cur.codeBlock = codeBuf.join('\n').trim()
    }
    codeBuf.length = 0
    inCode = false
  }

  function pushSection() {
    flushCode()
    if (cur?.eventName) sections.push(cur)
  }

  for (const el of elements) {
    // ── Paragraph ────────────────────────────────────────────────────────────
    if (el.paragraph) {
      const para  = el.paragraph
      const style = para.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT'
      const text  = paraText(para)

      if (style === 'HEADING_2' || style === 'HEADING_3') {
        pushSection()
        const name = cleanHeading(text)
        // Skip doc-title-level headings like "DataLayer Documentation"
        if (!name || isMetaHeading(name)) {
          cur = null
          continue
        }
        cur = { eventName: name, trigger: '', codeBlock: '', params: [] }
        continue
      }

      if (!cur) continue

      const isCode = isCodeParagraph(para) || looksLikeCode(text)

      if (isCode) {
        // Accumulate code lines — preserve Google Docs paragraph indentation
        inCode = true
        if (text) codeBuf.push(paraTextIndented(para))
        continue
      }

      // Non-code paragraph: flush any accumulated code block first
      if (inCode) flushCode()

      // Pipe-delimited param row (from our own export format)
      if (text.includes('|')) {
        const param = parsePipeRow(text)
        if (param) { cur.params.push(param); continue }
      }

      // Skip labels / bold headings ("Trigger:", "Fields explained:", etc.)
      const stripped = stripLabel(text)
      if (!stripped) continue

      // First non-empty normal text → trigger
      if (!cur.trigger) {
        cur.trigger = stripped
      }
    }

    // ── Table ─────────────────────────────────────────────────────────────────
    if (el.table && cur) {
      if (inCode) flushCode()
      const params = parseTable(el.table)
      cur.params.push(...params)
    }
  }

  pushSection()

  return sections.filter((s) => s.eventName)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Concatenate all text runs in a paragraph, strip trailing newline */
function paraText(para: Para): string {
  return (para.elements ?? [])
    .map((el) => el.textRun?.content ?? '')
    .join('')
    .replace(/\n$/, '')
    .trim()
}

/** paraText + leading spaces derived from Google Docs paragraph indent.
 *  indentStart is stored in PT (points). 36pt ≈ 1 standard indent level → 2 spaces. */
function paraTextIndented(para: Para): string {
  const text = paraText(para)
  if (!text) return ''
  const pts    = para.paragraphStyle?.indentStart?.magnitude ?? 0
  const spaces = Math.round(pts / 18) * 2   // 18pt → 2 spaces, 36pt → 4 spaces
  return spaces > 0 ? ' '.repeat(spaces) + text : text
}

/** True if any text run in the paragraph uses a monospace font */
function isCodeParagraph(para: Para): boolean {
  return (para.elements ?? []).some((el) => {
    const f = el.textRun?.textStyle?.weightedFontFamily?.fontFamily?.toLowerCase() ?? ''
    return f.includes('courier') || f.includes('mono') || f.includes('consolas') ||
           f.includes('source code') || f.includes('roboto mono') || f.includes('fira')
  })
}

/** Heuristic: does the text look like JS code? */
function looksLikeCode(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return (
    t.startsWith('dataLayer.push') ||
    t.startsWith('window.dataLayer') ||
    /^\s*\{/.test(t) ||
    /^\s*\}/.test(t) ||
    (/:\s*['"`\d{[]/.test(t) && !t.includes('|'))   // key: 'value' pattern
  )
}

/** Remove bold labels that appear as standalone heading paragraphs in the doc */
function stripLabel(text: string): string {
  const t = text.trim()
  // known labels / section headers we want to skip
  const labels = [
    /^trigger:/i,
    /^datalayer\s*(push)?:?$/i,
    /^fields?\s*explained:?$/i,
    /^name\s*\|/i,
    /^parameters?:?$/i,
    /^implementation:?$/i,
    /^notes?:?$/i,
    /^comments?:?$/i,
    /^status:?$/i,
    /^testing:?$/i,
  ]
  if (labels.some((r) => r.test(t))) {
    // Strip the label prefix and return whatever follows (e.g. "Trigger: User clicks …")
    const m = t.match(/^trigger:\s*(.*)/i)
    if (m && m[1].trim()) return m[1].trim()
    return ''
  }
  return t
}

function cleanHeading(text: string): string {
  return text
    .replace(/^#+\s*/, '')       // markdown-style # if any
    .split('\n')[0]               // first line only
    .trim()
}

function isMetaHeading(name: string): boolean {
  const low = name.toLowerCase()
  return (
    low.includes('dataLayer doc') ||
    low.includes('table of content') ||
    low.includes('documentation') ||
    low.includes('dev doc') ||
    low.includes('implementation') ||
    low.includes('overview') ||
    low.length > 80
  )
}

/** Parse a pipe-delimited row from our own export format:
 *  "name | description | type | example | notes"
 *  Returns null if it doesn't look like a valid param row. */
function parsePipeRow(text: string): ParsedParam | null {
  const parts = text.split('|').map((s) => s.trim())
  if (parts.length < 2) return null

  // Skip the header row
  const name = parts[0]
  if (!name || /^name$/i.test(name) || /^field$/i.test(name) || /^parameter$/i.test(name)) {
    return null
  }
  // Skip rows that look like field labels, not values
  if (name.toLowerCase().includes('description') || name.toLowerCase().includes('notes')) return null

  // Determine column positions based on header row structure or assume fixed order:
  // name | description | type | example | notes
  const example = parts[3] ?? ''
  const notes   = parts[4] ?? (parts[2] ?? '')

  return { name, example, notes }
}

/** Extract cell text (recursively through nested paragraphs) */
function cellText(cell: docs_v1.Schema$TableCell): string {
  return (cell.content ?? [])
    .flatMap((el) => el.paragraph?.elements ?? [])
    .map((el) => el.textRun?.content ?? '')
    .join('')
    .replace(/\n$/, '')
    .trim()
}

/** Parse a TABLE element into param rows */
function parseTable(table: Table): ParsedParam[] {
  const rows = table.tableRows ?? []
  if (rows.length < 2) return []

  // Identify column indices from header row
  const headerCells = rows[0].tableCells ?? []
  const headers = headerCells.map((c) => cellText(c).toLowerCase())

  const nameIdx    = headers.findIndex((h) => h.includes('name') || h.includes('field') || h.includes('parameter') || h.includes('variable'))
  const exampleIdx = headers.findIndex((h) => h.includes('example') || h.includes('value') || h.includes('sample'))
  const notesIdx   = headers.findIndex((h) =>
    h.includes('note') || h.includes('comment') || h.includes('description') ||
    h.includes('implementation') || h.includes('detail')
  )

  // Fallback: first col = name, last col = notes
  const effectiveNameIdx    = nameIdx    !== -1 ? nameIdx    : 0
  const effectiveExampleIdx = exampleIdx !== -1 ? exampleIdx : -1
  const effectiveNotesIdx   = notesIdx   !== -1 ? notesIdx   : (headers.length > 1 ? headers.length - 1 : -1)

  const params: ParsedParam[] = []

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r].tableCells ?? []

    const get = (idx: number) => (idx !== -1 && cells[idx] ? cellText(cells[idx]) : '')

    const name = get(effectiveNameIdx)
    if (!name || /^name$/i.test(name) || /^field$/i.test(name)) continue

    params.push({
      name,
      example: get(effectiveExampleIdx),
      notes:   get(effectiveNotesIdx),
    })
  }

  return params
}

// ─── URL helper ───────────────────────────────────────────────────────────────

/** Extract Google Docs document ID from a URL */
export function extractDocId(url: string): string | null {
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  return m?.[1] ?? null
}

// ─── Name normalisation for matching ─────────────────────────────────────────

/** Normalise an event name for fuzzy matching:
 *  "add_to_cart", "Add To Cart", "addToCart", "custom.purchase.add_to_cart"
 *  all normalise to "add_to_cart" */
export function normaliseEventName(raw: string): string {
  return raw
    .toLowerCase()
    // strip common prefixes like "custom.ecommerce."
    .replace(/^(custom|ga4|gtm|dl)\.[a-z_]+\./g, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')  // camelCase → snake_case
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
}

/** For headings like "modal_open/modal_close", return all candidate normalisations to try */
export function normaliseEventNameCandidates(raw: string): string[] {
  // Split on "/" and try each part separately, plus the whole thing
  const parts = raw.split('/').map((p) => p.trim()).filter(Boolean)
  const all   = parts.length > 1 ? [raw, ...parts] : [raw]
  return [...new Set(all.map(normaliseEventName))].filter(Boolean)
}
