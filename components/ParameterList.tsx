'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PARAMETER_GROUPS } from '@/lib/parameterGroups'

interface Parameter {
  id: string
  name: string
  description: string
  type: string
  isGlobal: boolean
  isGlobalAttached: boolean
  requiresGA4Registration: boolean
  ga4Registered: boolean
  value?: string   // "dynamic" or a constant — from EventParameter.value
}

interface AvailableParameter {
  id: string
  name: string
  type: string
  isGlobal: boolean
}

interface ParameterListProps {
  eventId: string
  apiBase: string
  parameters: Parameter[]
  allParameters: AvailableParameter[]
  onUpdate: () => void
}

const TYPES = ['string', 'int', 'float', 'boolean'] as const

export default function ParameterList({
  eventId,
  apiBase,
  parameters,
  allParameters,
  onUpdate,
}: ParameterListProps) {
  // Per-parameter value edits (only for non-global explicitly attached params)
  const [paramValues, setParamValues] = useState<Map<string, string>>(
    new Map(parameters.filter((p) => !p.isGlobalAttached).map((p) => [p.id, p.value ?? 'dynamic']))
  )

  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newType, setNewType] = useState<string>('string')
  const [newDescription, setNewDescription] = useState('')
  const [newIsGlobal, setNewIsGlobal] = useState(false)
  const [newRequiresGA4, setNewRequiresGA4] = useState(false)
  const [saving, setSaving] = useState(false)
  const [applyingGroup, setApplyingGroup] = useState<string | null>(null)
  const [groupResult, setGroupResult] = useState<{ groupKey: string; added: number; alreadyAttached: number } | null>(null)

  const attachedIds = new Set(parameters.map((p) => p.id))
  const attachable = allParameters.filter((p) => !p.isGlobal && !attachedIds.has(p.id))
  const filtered = attachable.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  // Exact match check — don't offer "create" if name already exists as a parameter
  const exactMatch = allParameters.some(
    (p) => p.name.toLowerCase() === search.trim().toLowerCase()
  )
  const canCreate = search.trim().length > 0 && !exactMatch

  const resetCreate = () => {
    setCreating(false)
    setNewType('string')
    setNewDescription('')
    setNewIsGlobal(false)
    setNewRequiresGA4(false)
  }

  const closeDialog = () => {
    setOpen(false)
    setSearch('')
    setGroupResult(null)
    resetCreate()
  }

  const applyGroup = async (groupKey: string) => {
    setApplyingGroup(groupKey)
    setGroupResult(null)
    try {
      const res = await fetch(`${apiBase}/events/${eventId}/apply-parameter-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: groupKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Failed to apply parameter group')
        return
      }
      setGroupResult({ groupKey, added: data.added, alreadyAttached: data.alreadyAttached })
      onUpdate()
    } finally {
      setApplyingGroup(null)
    }
  }

  const saveParamValue = async (parameterId: string, value: string) => {
    const trimmed = value.trim() || 'dynamic'
    await fetch(`${apiBase}/events/${eventId}/parameters`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameterId, value: trimmed }),
    })
    setParamValues((prev) => { const m = new Map(prev); m.set(parameterId, trimmed); return m })
  }

  const attach = async (parameterId: string) => {
    await fetch(`${apiBase}/events/${eventId}/parameters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameterId }),
    })
    closeDialog()
    onUpdate()
  }

  const detach = async (parameterId: string) => {
    await fetch(`${apiBase}/events/${eventId}/parameters?parameterId=${parameterId}`, {
      method: 'DELETE',
    })
    onUpdate()
  }

  const createAndAttach = async () => {
    const name = search.trim()
    if (!name) return
    setSaving(true)
    try {
      // Create the parameter
      const createRes = await fetch(`${apiBase}/parameters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: newType, description: newDescription, isGlobal: newIsGlobal, requiresGA4Registration: newRequiresGA4 }),
      })
      if (!createRes.ok) return
      const newParam = await createRes.json()

      // Attach it to this event
      await fetch(`${apiBase}/events/${eventId}/parameters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameterId: newParam.id }),
      })

      closeDialog()
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      {parameters.length === 0 && (
        <p className="text-sm text-muted-foreground">No parameters yet.</p>
      )}
      {parameters.map((p) => {
        const val = paramValues.get(p.id) ?? p.value ?? 'dynamic'
        const canEditValue = !p.isGlobalAttached && !p.isGlobal
        return (
          <div key={p.id} className="flex items-center gap-2 py-1.5 border-b last:border-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium font-mono">{p.name}</span>
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  {p.type}
                </Badge>
                {p.isGlobal && (
                  <Badge className="text-xs px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-200">
                    Global
                  </Badge>
                )}
                {p.requiresGA4Registration && (
                  <Badge
                    variant={p.ga4Registered ? 'default' : 'secondary'}
                    className="text-xs px-1.5 py-0"
                  >
                    {p.ga4Registered ? 'GA4 ✓' : 'GA4 pending'}
                  </Badge>
                )}
              </div>
              {p.description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.description}</p>
              )}
              {/* Value field — only for explicitly attached params */}
              {canEditValue && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs text-muted-foreground shrink-0">Value:</span>
                  <Input
                    className={`h-6 text-xs w-40 font-mono py-0 ${val === 'dynamic' ? 'text-muted-foreground italic' : ''}`}
                    value={val}
                    onChange={(e) => setParamValues((prev) => { const m = new Map(prev); m.set(p.id, e.target.value); return m })}
                    onFocus={(e) => { if (e.target.value === 'dynamic') { setParamValues((prev) => { const m = new Map(prev); m.set(p.id, ''); return m }) } }}
                    onBlur={(e) => saveParamValue(p.id, e.target.value)}
                    placeholder="dynamic"
                  />
                </div>
              )}
            </div>
            {!p.isGlobalAttached && !p.isGlobal && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7 px-2"
                onClick={() => detach(p.id)}
              >
                Remove
              </Button>
            )}
          </div>
        )
      })}

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true) }}>
        <DialogTrigger render={<Button variant="outline" size="sm" className="mt-2" />}>
          + Add parameter
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add parameter</DialogTitle>
          </DialogHeader>

          {!creating ? (
            <>
              <Input
                placeholder="Search or type a new name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />

              {/* Existing parameters list */}
              <div className="max-h-40 overflow-y-auto space-y-1 -mx-1">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors flex items-center gap-2"
                    onClick={() => attach(p.id)}
                  >
                    <span className="font-medium font-mono flex-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.type}</span>
                  </button>
                ))}
                {filtered.length === 0 && !canCreate && (
                  <p className="text-sm text-muted-foreground py-3 text-center">
                    {search ? 'No match found.' : 'All project parameters already attached.'}
                  </p>
                )}
              </div>

              {/* Create new option */}
              {canCreate && (
                <button
                  className="w-full text-left px-3 py-2.5 rounded-md text-sm border border-dashed hover:bg-accent transition-colors flex items-center gap-2 text-primary"
                  onClick={() => setCreating(true)}
                >
                  <span className="text-base leading-none">＋</span>
                  Create <span className="font-mono font-medium">&ldquo;{search.trim()}&rdquo;</span>
                </button>
              )}

              {/* ── Parameter groups ── only shown when search is empty */}
              {!search && (
                <>
                  <div className="relative my-1">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-background px-2 text-muted-foreground">Parameter groups</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {PARAMETER_GROUPS.map((group) => {
                      const result = groupResult?.groupKey === group.key ? groupResult : null
                      const isApplying = applyingGroup === group.key

                      return (
                        <div key={group.key} className="border rounded-lg p-3 space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{group.label}</p>
                              <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                                {group.description}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {group.parameters.length} parameters ·{' '}
                                <a
                                  href={group.docsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline hover:text-foreground"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  docs ↗
                                </a>
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => applyGroup(group.key)}
                              disabled={applyingGroup !== null}
                            >
                              {isApplying ? 'Adding…' : 'Add all'}
                            </Button>
                          </div>

                          {/* Result feedback */}
                          {result && (
                            <p className="text-xs text-muted-foreground">
                              {result.added > 0
                                ? `✓ Added ${result.added} parameter${result.added !== 1 ? 's' : ''}`
                                : '✓ All already attached'}
                              {result.alreadyAttached > 0 && result.added > 0
                                ? ` · ${result.alreadyAttached} already present`
                                : ''}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          ) : (
            /* Inline create form */
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={newType} onValueChange={(v) => setNewType(v ?? 'string')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder="What this parameter captures..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="new-global"
                  checked={newIsGlobal}
                  onCheckedChange={(v) => setNewIsGlobal(Boolean(v))}
                />
                <Label htmlFor="new-global" className="cursor-pointer text-sm">
                  Global (applies to all events)
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="new-ga4"
                  checked={newRequiresGA4}
                  onCheckedChange={(v) => setNewRequiresGA4(Boolean(v))}
                />
                <Label htmlFor="new-ga4" className="cursor-pointer text-sm">
                  Requires GA4 registration
                </Label>
              </div>

              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={createAndAttach} disabled={saving || !search.trim()}>
                  {saving ? 'Creating…' : 'Create & attach'}
                </Button>
                <Button variant="outline" size="sm" onClick={resetCreate}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
