'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ImportResult {
  found:     number
  matched:   number
  imported:  number
  unmatched: string[]
}

interface Props {
  apiBase: string   // /api/clients/[clientId]/projects/[projectId]
}

export default function GoogleDocImport({ apiBase }: Props) {
  const router      = useRouter()
  const inputRef    = useRef<HTMLInputElement>(null)

  const [open,      setOpen]      = useState(false)
  const [url,       setUrl]       = useState('')
  const [loading,   setLoading]   = useState(false)
  const [noScope,   setNoScope]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [result,    setResult]    = useState<ImportResult | null>(null)

  function reset() {
    setOpen(false)
    setUrl('')
    setError(null)
    setNoScope(false)
    setResult(null)
  }

  async function handleImport() {
    if (!url.trim()) { setError('Paste a Google Doc URL'); return }
    setLoading(true)
    setError(null)
    setNoScope(false)
    setResult(null)

    try {
      const res  = await fetch(`${apiBase}/datalayer/import`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.noScope) {
          setNoScope(true)
        } else {
          setError(data.error ?? `Import failed (${res.status})`)
        }
        return
      }

      setResult(data as ImportResult)
      router.refresh()
    } catch {
      setError('Network error — could not reach the server')
    } finally {
      setLoading(false)
    }
  }

  // ── Closed state: just a button ──────────────────────────────────────────────
  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}>
        ↑ Import Google Doc
      </Button>
    )
  }

  // ── Result state ─────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="flex items-center gap-3 flex-wrap rounded-md border border-green-200 bg-green-50 px-4 py-2.5 text-sm">
        <span className="font-medium text-green-800">
          Import complete — {result.imported} event{result.imported !== 1 ? 's' : ''} updated
        </span>
        {result.unmatched.length > 0 && (
          <span className="text-amber-700 text-xs">
            {result.unmatched.length} not matched: {result.unmatched.slice(0, 4).join(', ')}{result.unmatched.length > 4 ? '…' : ''}
          </span>
        )}
        <Button variant="ghost" size="sm" className="h-6 px-2 ml-auto" onClick={reset}>✕</Button>
      </div>
    )
  }

  // ── No-scope state: re-authorise prompt ──────────────────────────────────────
  if (noScope) {
    return (
      <div className="flex items-center gap-3 flex-wrap rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
        <span className="text-amber-800">
          Google Docs access needs to be re-authorised.
        </span>
        <Button
          size="sm"
          className="h-7"
          onClick={() => signIn('google', { callbackUrl: window.location.href })}
        >
          Re-authorise Google
        </Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={reset}>Cancel</Button>
      </div>
    )
  }

  // ── Input state ───────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Input
        ref={inputRef}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleImport(); if (e.key === 'Escape') reset() }}
        placeholder="https://docs.google.com/document/d/…"
        className="w-80 h-8 text-sm"
        disabled={loading}
      />
      <Button size="sm" className="h-8" onClick={handleImport} disabled={loading || !url.trim()}>
        {loading ? 'Importing…' : 'Import'}
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={reset} disabled={loading}>
        Cancel
      </Button>
      {error && <p className="text-xs text-destructive w-full">{error}</p>}
    </div>
  )
}
