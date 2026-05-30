'use client'

import { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'

interface Param {
  parameterId: string
  value:       string   // "dynamic" or a constant
  name:        string
  description: string
  type:        string
  example:     string
}

interface ParamNote {
  id:        string
  sectionId: string
  paramName: string
  example:   string
  notes:     string
}

interface Props {
  sectionId:           string
  eventId:             string
  params:              Param[]
  paramNotes:          ParamNote[]
  sectionUrl:          string
  eventsApiUrl:        string
  codeBlockCustomised: boolean
  onNotesChange:       (notes: ParamNote[]) => void
  onCodeBlockUpdate:   (codeBlock: string) => void
  onRemoveParam:       (parameterId: string) => Promise<void>
}

export default function ParameterTable({
  sectionId: _,
  eventId,
  params,
  paramNotes,
  sectionUrl,
  eventsApiUrl,
  codeBlockCustomised,
  onNotesChange,
  onCodeBlockUpdate,
  onRemoveParam,
}: Props) {
  const noteMap = new Map(paramNotes.map((n) => [n.paramName, n]))

  const [notes, setNotes] = useState<Map<string, { example: string; notes: string }>>(
    new Map(
      params.map((p) => [
        p.name,
        {
          example: noteMap.get(p.name)?.example ?? p.example,
          notes:   noteMap.get(p.name)?.notes ?? '',
        },
      ])
    )
  )

  // Per-param value overrides (local state; saved to server on blur)
  const [values, setValues] = useState<Map<string, string>>(
    new Map(params.map((p) => [p.name, p.value ?? 'dynamic']))
  )

  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // ─── Notes ────────────────────────────────────────────────────────────────────

  function updateNote(paramName: string, field: 'example' | 'notes', value: string) {
    setNotes((prev) => {
      const next = new Map(prev)
      next.set(paramName, { ...prev.get(paramName)!, [field]: value })
      return next
    })
    const key = `${paramName}:${field}`
    const existing = saveTimers.current.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => saveNote(paramName), 600)
    saveTimers.current.set(key, timer)
  }

  async function saveNote(paramName: string) {
    const note = notes.get(paramName)
    if (!note) return
    const res = await fetch(`${sectionUrl}/param-notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paramName, example: note.example, notes: note.notes }),
    })
    if (res.ok) {
      const saved = await res.json()
      const allNotes = params.map((p) => {
        if (p.name === paramName) return saved
        return noteMap.get(p.name) ?? { id: '', sectionId: '', paramName: p.name, example: p.example, notes: '' }
      })
      onNotesChange(allNotes)
    }
  }

  // ─── Parameter values ─────────────────────────────────────────────────────────

  async function saveValue(param: Param, newValue: string) {
    const trimmed = newValue.trim() || 'dynamic'
    // 1. Persist to EventParameter
    const res = await fetch(`${eventsApiUrl}/events/${eventId}/parameters`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameterId: param.parameterId, value: trimmed }),
    })
    if (!res.ok) return

    // 2. Regenerate code block (only when not manually customised)
    if (!codeBlockCustomised) {
      const regen = await fetch(`${sectionUrl}/regenerate`, { method: 'POST' })
      if (regen.ok) {
        const updated = await regen.json()
        onCodeBlockUpdate(updated.codeBlock)
      }
    }
  }

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Fields explained
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-32">Name</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Description</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-16">Type</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-36" title="'dynamic' = varies at runtime; set a constant to hard-code the value in the push">Value</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-36">Example</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-44">Notes</th>
              <th className="w-6" data-print-hide />
            </tr>
          </thead>
          <tbody>
            {params.map((p, idx) => {
              const note = notes.get(p.name) ?? { example: p.example, notes: '' }
              const val  = values.get(p.name) ?? 'dynamic'
              const isDynamic = val === 'dynamic'
              return (
                <tr
                  key={p.name}
                  className={`group/row ${idx % 2 === 0 ? '' : 'bg-muted/20'}`}
                  style={{ borderBottom: idx < params.length - 1 ? '1px solid var(--border)' : undefined }}
                >
                  <td className="px-3 py-2 font-mono text-xs font-medium">{p.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.description}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="inline-block rounded px-1.5 py-0.5 bg-muted text-muted-foreground font-mono text-xs">
                      {p.type}
                    </span>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      className={`h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input font-mono ${isDynamic ? 'text-muted-foreground italic' : 'text-foreground'}`}
                      value={val}
                      onChange={(e) => setValues((prev) => { const m = new Map(prev); m.set(p.name, e.target.value); return m })}
                      onBlur={(e) => saveValue(p, e.target.value)}
                      onFocus={(e) => { if (e.target.value === 'dynamic') { setValues((prev) => { const m = new Map(prev); m.set(p.name, ''); return m }) } }}
                      placeholder="dynamic"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input font-mono"
                      value={note.example}
                      onChange={(e) => updateNote(p.name, 'example', e.target.value)}
                      placeholder={p.example || 'e.g. value'}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                      value={note.notes}
                      onChange={(e) => updateNote(p.name, 'notes', e.target.value)}
                      placeholder="Add notes…"
                    />
                  </td>
                  <td className="px-1 py-1 text-right" data-print-hide>
                    <button
                      className="text-muted-foreground/40 hover:text-destructive text-xs leading-none px-1 py-0.5 rounded opacity-0 group-hover/row:opacity-100 transition-opacity"
                      onClick={() => onRemoveParam(p.parameterId)}
                      title="Remove from fields table"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
