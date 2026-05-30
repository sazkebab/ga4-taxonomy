'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  sectionId:    string
  ecommerceJson: string
  sectionUrl:   string
  onUpdate:     (ecommerceJson: string, newCodeBlock: string) => void
}

export default function EcommerceEditor({
  sectionId: _,
  ecommerceJson,
  sectionUrl,
  onUpdate,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  // Display prettified JSON in the textarea
  const prettyJson = (() => {
    if (!ecommerceJson) return ''
    try { return JSON.stringify(JSON.parse(ecommerceJson), null, 2) }
    catch { return ecommerceJson }
  })()

  const [value, setValue]     = useState(prettyJson)
  const [saving, setSaving]   = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const savedRef              = useRef(prettyJson)

  async function save(raw: string) {
    if (raw === savedRef.current) return
    // Validate JSON
    let parsed: unknown
    try { parsed = JSON.parse(raw) }
    catch {
      setSaveErr('Invalid JSON — please check the syntax')
      return
    }
    setSaveErr(null)
    setSaving(true)
    const normalised = JSON.stringify(parsed)
    try {
      const res = await fetch(sectionUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ecommerceJson: normalised }),
      })
      if (res.ok) {
        const data = await res.json()
        savedRef.current = raw
        onUpdate(normalised, data.codeBlock ?? '')
      } else {
        setSaveErr('Save failed')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50/40">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            Ecommerce object
          </span>
          <span className="text-xs text-blue-500">
            (GA4 spec — edit once, copy to all)
          </span>
        </div>
        <span className="text-blue-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Edit the <code className="bg-muted px-1 rounded">ecommerce</code> object below.
            Saving will regenerate the code block above (unless you&apos;ve manually edited it).
          </p>
          <textarea
            className="w-full font-mono text-xs rounded-md border border-input bg-white p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            rows={18}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={(e) => save(e.target.value)}
            spellCheck={false}
          />
          {saveErr && <p className="text-xs text-destructive">{saveErr}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => save(value)}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save ecommerce object'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
