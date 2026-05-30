'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import ParametersClient from './ParametersClient'

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

type FilterKey = '' | 'ga4_pending' | 'ga4_registered' | 'global'

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface FilterProps {
  action: 'filter'
  currentFilter: string
  counts: Record<FilterKey, number>
}

// ─── GA4 register button ──────────────────────────────────────────────────────

interface GA4RegisterProps {
  action: 'ga4-register'
  apiBase: string
  ga4PendingCount: number
}

// ─── Parameter row ────────────────────────────────────────────────────────────

interface RowProps {
  action: 'row'
  parameter: Parameter
  apiBase: string
}

type Props = FilterProps | GA4RegisterProps | RowProps

// ─────────────────────────────────────────────────────────────────────────────

export default function ParametersPageClient(props: Props) {
  if (props.action === 'filter') return <FilterBar {...props} />
  if (props.action === 'ga4-register') return <GA4RegisterButton {...props} />
  return <ParameterRow {...props} />
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({ currentFilter, counts }: FilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setFilter = (f: FilterKey) => {
    const params = new URLSearchParams(searchParams.toString())
    if (f) params.set('filter', f)
    else params.delete('filter')
    router.push(`${pathname}?${params.toString()}`)
  }

  const filters: { key: FilterKey; label: string }[] = [
    { key: '',               label: 'All' },
    { key: 'ga4_pending',    label: 'GA4 pending' },
    { key: 'ga4_registered', label: 'GA4 registered' },
    { key: 'global',         label: 'Global' },
  ]

  return (
    <div className="flex gap-1.5 flex-wrap">
      {filters.map((f) => (
        <Button
          key={f.key}
          variant={currentFilter === f.key ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs px-2.5"
          onClick={() => setFilter(f.key)}
        >
          {f.label}
          <span className="ml-1 text-xs opacity-70">({counts[f.key]})</span>
        </Button>
      ))}
    </div>
  )
}

// ─── GA4 register button ──────────────────────────────────────────────────────

function GA4RegisterButton({ apiBase, ga4PendingCount }: GA4RegisterProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ newlyRegistered: number; alreadyRegistered: number; errors: string[] } | null>(null)

  const run = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`${apiBase}/parameters/ga4-register`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'GA4 registration failed')
        return
      }
      setResult(data)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && (
        <p className="text-xs text-muted-foreground">
          {result.newlyRegistered > 0
            ? `✓ Registered ${result.newlyRegistered} new`
            : result.alreadyRegistered > 0
            ? `✓ All already registered`
            : `Nothing to register`}
          {result.errors.length > 0 && ` · ${result.errors.length} errors`}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={run}
        disabled={loading || ga4PendingCount === 0}
        title={ga4PendingCount === 0 ? 'No parameters pending GA4 registration' : undefined}
      >
        {loading ? 'Checking GA4…' : `Check & register GA4${ga4PendingCount > 0 ? ` (${ga4PendingCount})` : ''}`}
      </Button>
    </div>
  )
}

// ─── Parameter row ────────────────────────────────────────────────────────────

function ParameterRow({ parameter: param, apiBase }: RowProps) {
  const router = useRouter()
  const [ga4Registered, setGa4Registered] = useState(param.ga4Registered)
  const [toggling, setToggling] = useState(false)

  // Sync local state when the server refreshes (e.g. after bulk GA4 registration)
  useEffect(() => {
    setGa4Registered(param.ga4Registered)
  }, [param.ga4Registered])

  const toggleGa4 = async (value: boolean) => {
    setToggling(true)
    setGa4Registered(value)
    await fetch(`${apiBase}/parameters/${param.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ga4Registered: value }),
    })
    setToggling(false)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-3 pr-6 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium font-mono">{param.name}</span>
          <Badge variant="outline" className="text-xs px-1.5 py-0">
            {param.type}
          </Badge>
          {param.isGlobal && (
            <Badge className="text-xs px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-200">
              Global
            </Badge>
          )}
        </div>
        {param.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{param.description}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          Used in {param._count.events} event{param._count.events !== 1 ? 's' : ''}
          {param.isGlobal ? ' (+ all events via global)' : ''}
        </p>
      </div>

      {/* Inline GA4 registration checkbox */}
      {param.requiresGA4Registration && (
        <div className="flex items-center gap-1.5 shrink-0">
          <Checkbox
            id={`ga4-${param.id}`}
            checked={ga4Registered}
            disabled={toggling}
            onCheckedChange={(v) => toggleGa4(Boolean(v))}
          />
          <label
            htmlFor={`ga4-${param.id}`}
            className="text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap"
          >
            {ga4Registered ? 'GA4 ✓' : 'GA4 pending'}
          </label>
        </div>
      )}

      <ParametersClient action="edit" parameter={param} apiBase={apiBase} />
    </div>
  )
}
