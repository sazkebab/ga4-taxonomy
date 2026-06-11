'use client'

import { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { lenientJsonParse } from '@/lib/dataLayerDoc'
import type { EcommerceNote } from './types'

interface Field {
  path:  string   // "currency", "items.item_id", etc.
  label: string   // display name
  type:  string   // inferred from value
}

interface Props {
  sectionId:    string
  ecommerceJson: string
  notes:        EcommerceNote[]
  sectionUrl:   string
  onNotesChange: (notes: EcommerceNote[]) => void
  onCopy?:      () => void
  copyMessage?: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inferType(val: unknown): string {
  if (val === null || val === undefined) return 'string'
  if (typeof val === 'boolean') return 'boolean'
  if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'float'
  return 'string'
}

function parseFields(ecommerceJson: string): { top: Field[]; items: Field[] } {
  const top:   Field[] = []
  const items: Field[] = []
  if (!ecommerceJson) return { top, items }

  const obj = lenientJsonParse(ecommerceJson)
  if (!obj || typeof obj !== 'object') return { top, items }

  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (key === 'items' && Array.isArray(val) && val.length > 0) {
      for (const [iKey, iVal] of Object.entries(val[0] as Record<string, unknown>)) {
        items.push({ path: `items.${iKey}`, label: iKey, type: inferType(iVal) })
      }
    } else {
      top.push({ path: key, label: key, type: inferType(val) })
    }
  }
  return { top, items }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EcommerceFieldsTable({
  sectionId,
  ecommerceJson,
  notes,
  sectionUrl,
  onNotesChange,
  onCopy,
  copyMessage,
}: Props) {
  const { top, items } = parseFields(ecommerceJson)
  const allFields = [...top, ...items]

  const noteMap = new Map(notes.map((n) => [n.fieldPath, n]))
  const [localNotes, setLocalNotes] = useState<Map<string, string>>(
    new Map(allFields.map((f) => [f.path, noteMap.get(f.path)?.notes ?? '']))
  )

  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  function updateNote(fieldPath: string, value: string) {
    setLocalNotes((prev) => { const m = new Map(prev); m.set(fieldPath, value); return m })

    const existing = saveTimers.current.get(fieldPath)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => saveNote(fieldPath, value), 600)
    saveTimers.current.set(fieldPath, timer)
  }

  async function saveNote(fieldPath: string, value: string) {
    const res = await fetch(`${sectionUrl}/ecommerce-notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldPath, notes: value }),
    })
    if (res.ok) {
      const saved: EcommerceNote = await res.json()
      const next = notes.filter((n) => n.fieldPath !== fieldPath)
      onNotesChange([...next, saved])
    }
  }

  if (allFields.length === 0) return null

  function renderSection(fields: Field[], heading: string) {
    if (fields.length === 0) return null
    return (
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-1.5 bg-muted/30 border-b border-border">
          {heading}
        </p>
        {fields.map((f, idx) => {
          const noteVal = localNotes.get(f.path) ?? ''
          return (
            <div
              key={f.path}
              className={`flex items-center gap-2 px-3 py-1.5 ${idx % 2 === 0 ? '' : 'bg-muted/15'} border-b border-border last:border-0`}
            >
              <span className="font-mono text-xs font-medium w-40 shrink-0 truncate" title={f.path}>
                {f.label}
              </span>
              <span className="w-14 shrink-0">
                <span className="inline-block rounded px-1.5 py-0.5 bg-muted text-muted-foreground font-mono text-xs">
                  {f.type}
                </span>
              </span>
              <Input
                className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input flex-1"
                value={noteVal}
                onChange={(e) => updateNote(f.path, e.target.value)}
                placeholder="Add notes…"
              />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border overflow-hidden" data-section-id={sectionId}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Ecommerce fields explained
        </p>
        {onCopy && (
          <div className="flex items-center gap-2">
            {copyMessage && <span className="text-xs text-muted-foreground">{copyMessage}</span>}
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 px-2"
              onClick={onCopy}
            >
              Copy to all ecommerce events
            </Button>
          </div>
        )}
      </div>

      {renderSection(top, 'Top-level fields')}
      {renderSection(items, 'items[ ] fields')}
    </div>
  )
}
