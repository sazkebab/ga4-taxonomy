'use client'

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EventItem {
  id: string
  name: string
  category: string
  trigger: string
  notes: string
  isKeyEvent: boolean
  requiresDataLayer: boolean
  parameters: { id: string; name: string; value: string }[]
  stage: string
  stageLabel: string
  stageColor: string
  ga4FireCount: number | null   // null = never checked; 0 = checked, not fired
  ga4CheckedAt: string | null   // ISO string
}

interface StageOption {
  key: string
  label: string
  color: string
}

interface Props {
  events: EventItem[]
  base: string
  apiBase: string
  hasGa4Property: boolean
  stages: StageOption[]
  currentSort: string
}

// ─────────────────────────────────────────────────────────────────────────────

export default function EventsListClient({ events, base, apiBase, hasGa4Property, stages, currentSort }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  // Update the ?sort= param in the URL
  const setSort = useCallback((sort: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (sort && sort !== 'name_asc') params.set('sort', sort)
    else params.delete('sort')
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  // ── Bulk select ─────────────────────────────────────────────────────────────
  const [selected,      setSelected]      = useState<Set<string>>(new Set())
  const [deleting,      setDeleting]      = useState(false)
  const [updating,      setUpdating]      = useState(false)
  const [bulkCategory,  setBulkCategory]  = useState('')

  // Distinct categories already present in the list (for datalist suggestions)
  const existingCategories = useMemo(() => {
    const set = new Set<string>()
    events.forEach((e) => { if (e.category) set.add(e.category) })
    return [...set].sort()
  }, [events])

  // ── GA4 check ───────────────────────────────────────────────────────────────
  const [ga4Loading, setGa4Loading] = useState(false)
  const [ga4Error,   setGa4Error]   = useState<string | null>(null)

  // ── Duplicate ───────────────────────────────────────────────────────────────
  const [duplicating, setDuplicating] = useState<string | null>(null)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected  = events.length > 0 && selected.size === events.length
  const someSelected = selected.size > 0 && !allSelected

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(events.map((e) => e.id)))
  }

  // ── Bulk delete ─────────────────────────────────────────────────────────────
  const bulkDelete = async () => {
    const count = selected.size
    if (!confirm(`Delete ${count} event${count !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await fetch(`${apiBase}/events/bulk-delete`, {
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

  // ── Bulk stage change ────────────────────────────────────────────────────────
  const bulkSetStage = async (stage: string) => {
    setUpdating(true)
    try {
      await fetch(`${apiBase}/events/bulk-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], stage }),
      })
      setSelected(new Set())
      router.refresh()
    } finally {
      setUpdating(false)
    }
  }

  // ── Bulk category change ──────────────────────────────────────────────────
  const bulkSetCategory = async () => {
    setUpdating(true)
    try {
      await fetch(`${apiBase}/events/bulk-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], category: bulkCategory.trim() }),
      })
      setSelected(new Set())
      setBulkCategory('')
      router.refresh()
    } finally {
      setUpdating(false)
    }
  }

  // ── Check GA4 ───────────────────────────────────────────────────────────────
  const checkGa4 = async () => {
    setGa4Loading(true)
    setGa4Error(null)
    try {
      const res  = await fetch(`${apiBase}/ga4/event-counts`)
      const text = await res.text()
      let data: { error?: string; counts?: Record<string, number> }
      try {
        data = JSON.parse(text)
      } catch {
        setGa4Error(`Server error (${res.status}) — check the server logs`)
        return
      }
      if (!res.ok) {
        setGa4Error(data.error ?? `Error ${res.status}`)
        return
      }
      router.refresh()
    } catch {
      setGa4Error('Network error — could not reach the server')
    } finally {
      setGa4Loading(false)
    }
  }

  // ── Duplicate ────────────────────────────────────────────────────────────────
  const duplicate = async (eventId: string) => {
    setDuplicating(eventId)
    try {
      const res = await fetch(`${apiBase}/events/${eventId}/duplicate`, { method: 'POST' })
      if (res.ok) router.refresh()
    } finally {
      setDuplicating(null)
    }
  }

  const lastCheckedAt = events.find((e) => e.ga4CheckedAt)?.ga4CheckedAt ?? null
  const lastCheckedLabel = lastCheckedAt ? formatRelative(new Date(lastCheckedAt)) : null

  if (events.length === 0) return null

  return (
    <div>
      {/* GA4 check bar */}
      {hasGa4Property && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Button variant="outline" size="sm" onClick={checkGa4} disabled={ga4Loading}>
            {ga4Loading ? 'Checking GA4…' : 'Check GA4 (last 90 days)'}
          </Button>
          {lastCheckedLabel && (
            <span className="text-xs text-muted-foreground">Last checked {lastCheckedLabel}</span>
          )}
          {ga4Error && <p className="text-xs text-destructive">{ga4Error}</p>}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-muted/60 border rounded-lg flex-wrap">
          <span className="text-sm font-medium shrink-0">
            {selected.size} event{selected.size !== 1 ? 's' : ''} selected
          </span>

          {/* Set stage */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Stage:</span>
            <Select onValueChange={(v: string | null) => { if (v) bulkSetStage(v) }} disabled={updating}>
              <SelectTrigger className="h-7 text-xs w-44">
                <SelectValue placeholder="Choose stage…" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.key} value={s.key} className="text-xs">
                    <span className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${s.color} shrink-0`} />
                      {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Set category */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Category:</span>
            <Input
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && bulkCategory.trim()) bulkSetCategory() }}
              placeholder="type or pick…"
              list="bulk-category-list"
              className="h-7 text-xs w-36 px-2"
              disabled={updating}
            />
            {existingCategories.length > 0 && (
              <datalist id="bulk-category-list">
                {existingCategories.map((c) => <option key={c} value={c} />)}
              </datalist>
            )}
            <Button
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={bulkSetCategory}
              disabled={updating || !bulkCategory.trim()}
            >
              Apply
            </Button>
          </div>

          <Button variant="destructive" size="sm" onClick={bulkDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : `Delete ${selected.size}`}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setSelected(new Set()); setBulkCategory('') }}>
            Cancel
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/40 border-b">
              {/* Checkbox */}
              <th className="w-10 px-3 py-2.5 text-left">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all events"
                />
              </th>
              {/* Trigger — not sortable */}
              <th className="px-3 py-2.5 text-left w-48">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Trigger
                </span>
              </th>
              {/* Event name — sortable */}
              <th className="px-3 py-2.5 text-left w-48">
                <SortHeader
                  label="Event"
                  sortAsc="name_asc"
                  sortDesc="name_desc"
                  currentSort={currentSort}
                  onSort={setSort}
                />
              </th>
              {/* Category — sortable */}
              <th className="px-3 py-2.5 text-left w-32">
                <SortHeader
                  label="Category"
                  sortAsc="category_asc"
                  sortDesc="category_desc"
                  currentSort={currentSort}
                  onSort={setSort}
                />
              </th>
              {/* Parameters — not sortable */}
              <th className="px-3 py-2.5 text-left">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Parameters
                </span>
              </th>
              {/* Key event — not sortable */}
              <th className="px-3 py-2.5 text-center w-20">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Key event
                </span>
              </th>
              {/* dataLayer — not sortable */}
              <th className="px-3 py-2.5 text-center w-20">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  dataLayer
                </span>
              </th>
              {/* Progress — sortable */}
              <th className="px-3 py-2.5 text-left w-40">
                <SortHeader
                  label="Progress"
                  sortAsc="stage_asc"
                  sortDesc="stage_desc"
                  currentSort={currentSort}
                  onSort={setSort}
                />
              </th>
              {/* GA4 fires — sortable */}
              <th className="px-3 py-2.5 text-right w-24">
                <div className="flex justify-end">
                  <SortHeader
                    label="GA4 fires"
                    sortAsc="fires_asc"
                    sortDesc="fires_desc"
                    currentSort={currentSort}
                    primaryDesc
                    onSort={setSort}
                  />
                </div>
              </th>
              {/* Copy */}
              <th className="w-10 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {events.map((event) => {
              const isSelected    = selected.has(event.id)
              const checked       = event.ga4FireCount !== null
              const notFired      = checked && event.ga4FireCount === 0
              const isDuplicating = duplicating === event.id

              return (
                <tr
                  key={event.id}
                  className={[
                    'transition-colors',
                    isSelected ? 'bg-accent/30'        : 'hover:bg-accent/20',
                    notFired   ? 'bg-amber-50/60'      : '',
                  ].join(' ')}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(event.id)}
                      aria-label={`Select ${event.name}`}
                    />
                  </td>

                  {/* Trigger */}
                  <td className="px-3 py-3 max-w-0 w-48">
                    {event.trigger ? (
                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                        {event.trigger}
                      </p>
                    ) : (
                      <span className="text-xs text-muted-foreground/40 italic">—</span>
                    )}
                  </td>

                  {/* Event name — clickable link */}
                  <td className="px-3 py-3 max-w-0 w-48">
                    <Link
                      href={`${base}/events/${event.id}`}
                      className="font-mono text-sm font-medium hover:underline text-foreground"
                    >
                      {event.name}
                    </Link>
                    {event.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                        {event.notes}
                      </p>
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-3 py-3 w-32">
                    {event.category ? (
                      <span className="inline-block rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground capitalize whitespace-nowrap">
                        {event.category}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/30">—</span>
                    )}
                  </td>

                  {/* Parameters */}
                  <td className="px-3 py-3">
                    {event.parameters.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {event.parameters.slice(0, 6).map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono bg-muted text-muted-foreground whitespace-nowrap"
                          >
                            {p.value && p.value !== 'dynamic'
                              ? <><span className="text-foreground">{p.name}</span><span className="mx-0.5 text-muted-foreground/50">:</span><span className="text-blue-600">{p.value}</span></>
                              : p.name}
                          </span>
                        ))}
                        {event.parameters.length > 6 && (
                          <span className="text-xs text-muted-foreground self-center">
                            +{event.parameters.length - 6} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Key event */}
                  <td className="px-3 py-3 text-center">
                    {event.isKeyEvent ? (
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold" title="Key event">
                        ★
                      </span>
                    ) : (
                      <span className="text-muted-foreground/25 text-sm">—</span>
                    )}
                  </td>

                  {/* dataLayer */}
                  <td className="px-3 py-3 text-center">
                    {event.requiresDataLayer ? (
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold" title="Requires dataLayer push">
                        ✓
                      </span>
                    ) : (
                      <span className="text-muted-foreground/25 text-sm">—</span>
                    )}
                  </td>

                  {/* Progress */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-2 w-2 rounded-full ${event.stageColor} shrink-0`} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {event.stageLabel}
                      </span>
                    </div>
                  </td>

                  {/* GA4 fires */}
                  <td className="px-3 py-3 text-right">
                    {checked ? (
                      notFired ? (
                        <span className="text-xs text-amber-600 font-medium whitespace-nowrap" title="Not seen in GA4 in the last 90 days">
                          ⚠ Not fired
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {(event.ga4FireCount ?? 0).toLocaleString()}
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground/30">—</span>
                    )}
                  </td>

                  {/* Copy/Duplicate */}
                  <td className="px-2 py-3">
                    <button
                      onClick={() => duplicate(event.id)}
                      disabled={isDuplicating}
                      title={`Duplicate ${event.name}`}
                      className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                    >
                      {isDuplicating ? <span className="text-xs">…</span> : <CopyIcon />}
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

// ─── SortHeader ───────────────────────────────────────────────────────────────

/**
 * A clickable table-header button that cycles through:
 *   unsorted → asc → desc → unsorted
 * If `primaryDesc` is true the first click goes to desc (useful for GA4 fires).
 */
function SortHeader({
  label,
  sortAsc,
  sortDesc,
  currentSort,
  primaryDesc = false,
  onSort,
}: {
  label: string
  sortAsc: string
  sortDesc: string
  currentSort: string
  primaryDesc?: boolean
  onSort: (sort: string) => void
}) {
  const isAsc  = currentSort === sortAsc
  const isDesc = currentSort === sortDesc
  const active = isAsc || isDesc

  function handleClick() {
    if (!active) {
      // First click → preferred primary direction
      onSort(primaryDesc ? sortDesc : sortAsc)
    } else if (primaryDesc) {
      // desc → asc → clear
      onSort(isDesc ? sortAsc : '')
    } else {
      // asc → desc → clear
      onSort(isAsc ? sortDesc : '')
    }
  }

  return (
    <button
      onClick={handleClick}
      className={[
        'flex items-center gap-1 text-xs font-semibold uppercase tracking-wide',
        'hover:text-foreground transition-colors select-none',
        active ? 'text-foreground' : 'text-muted-foreground',
      ].join(' ')}
    >
      {label}
      <span className={active ? 'opacity-80' : 'opacity-30'}>
        {isAsc ? '↑' : isDesc ? '↓' : '↕'}
      </span>
    </button>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(date: Date): string {
  const diffMs   = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1)  return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24)  return `${diffHrs}h ago`
  return `${Math.floor(diffHrs / 24)}d ago`
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1 9.5A1.5 1.5 0 002.5 11H3v.5A1.5 1.5 0 004.5 13h7a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0011.5 3H11v-.5A1.5 1.5 0 009.5 1h-7A1.5 1.5 0 001 2.5v7zm1.5.5a.5.5 0 01-.5-.5v-7a.5.5 0 01.5-.5h7a.5.5 0 01.5.5V3H4.5A1.5 1.5 0 003 4.5V11h-.5zm2 1.5V4.5a.5.5 0 01.5-.5h7a.5.5 0 01.5.5v7a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  )
}
