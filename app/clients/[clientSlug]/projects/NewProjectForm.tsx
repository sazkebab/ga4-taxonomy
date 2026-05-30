'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  apiUrl: string  // POST /api/clients/[clientId]/projects
}

export default function NewProjectForm({ apiUrl }: Props) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [name, setName]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const reset = () => { setOpen(false); setName(''); setError(null) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Error ${res.status}`)
        return
      }
      reset()
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>+ New project</Button>
    )
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        autoFocus
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-52"
        disabled={saving}
      />
      <Button type="submit" disabled={saving || !name.trim()}>
        {saving ? 'Creating…' : 'Create'}
      </Button>
      <Button type="button" variant="ghost" onClick={reset} disabled={saving}>
        Cancel
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
