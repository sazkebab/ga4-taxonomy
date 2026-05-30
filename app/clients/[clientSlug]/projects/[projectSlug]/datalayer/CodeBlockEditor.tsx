'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  sectionId: string
  codeBlock: string
  customised: boolean
  sectionUrl: string
  onUpdate: (codeBlock: string, customised: boolean) => void
}

export default function CodeBlockEditor({ sectionId: _, codeBlock: initialCode, customised, sectionUrl, onUpdate }: Props) {
  const [code, setCode] = useState(initialCode)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const savedRef = useRef(initialCode)

  async function saveCodeBlock(value: string) {
    if (value === savedRef.current) return
    setSaving(true)
    try {
      const res = await fetch(sectionUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeBlock: value }),
      })
      if (res.ok) {
        savedRef.current = value
        onUpdate(value, true)
      }
    } finally {
      setSaving(false)
    }
  }

  async function regenerate() {
    setRegenerating(true)
    try {
      const res = await fetch(`${sectionUrl}/regenerate`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setCode(data.codeBlock)
        savedRef.current = data.codeBlock
        onUpdate(data.codeBlock, false)
      }
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          dataLayer.push()
        </span>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
          {customised && !saving && (
            <span className="text-xs text-muted-foreground italic">Edited</span>
          )}
          {customised && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={regenerate}
              disabled={regenerating}
            >
              {regenerating ? 'Regenerating…' : '↺ Regenerate'}
            </Button>
          )}
        </div>
      </div>
      <textarea
        className="w-full font-mono text-sm rounded-md border border-input bg-muted/40 p-3 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        rows={Math.max(4, code.split('\n').length + 1)}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onBlur={(e) => saveCodeBlock(e.target.value)}
        spellCheck={false}
      />
    </div>
  )
}
