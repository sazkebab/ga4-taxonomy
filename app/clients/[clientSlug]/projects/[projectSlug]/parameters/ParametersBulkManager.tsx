'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import ParametersPageClient from './ParametersPageClient'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Parameter {
  id: string
  name: string
  description: string
  example: string
  type: string
  isGlobal: boolean
  requiresGA4Registration: boolean
  ga4Registered: boolean
  _count: { events: number }
}

interface Props {
  parameters: Parameter[]
  apiBase: string
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ParametersBulkManager({ parameters, apiBase }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = parameters.length > 0 && selected.size === parameters.length
  const someSelected = selected.size > 0 && !allSelected

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(parameters.map((p) => p.id)))
  }

  const bulkDelete = async () => {
    const count = selected.size
    if (!confirm(`Delete ${count} parameter${count !== 1 ? 's' : ''}? This will remove them from all events. This cannot be undone.`)) return
    setDeleting(true)
    try {
      await fetch(`${apiBase}/parameters/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      })
      setSelected(new Set())
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  if (parameters.length === 0) return null

  return (
    <div>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-destructive/10 border-b border-destructive/20">
          <span className="text-sm font-medium">
            {selected.size} parameter{selected.size !== 1 ? 's' : ''} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={bulkDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : `Delete ${selected.size}`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Select-all header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          onCheckedChange={toggleAll}
          aria-label="Select all parameters"
        />
        <span className="text-xs text-muted-foreground">Select all</span>
      </div>

      {/* Parameter rows — checkbox column + row content share the same pl-3 indent */}
      <div className="divide-y">
        {parameters.map((param) => (
          <div key={param.id} className="flex items-center gap-2 pl-3">
            <Checkbox
              checked={selected.has(param.id)}
              onCheckedChange={() => toggle(param.id)}
              aria-label={`Select ${param.name}`}
              className="shrink-0"
            />
            <div className="flex-1 min-w-0">
              <ParametersPageClient
                action="row"
                parameter={param}
                apiBase={apiBase}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
