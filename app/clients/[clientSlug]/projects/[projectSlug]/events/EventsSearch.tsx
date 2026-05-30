'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCallback } from 'react'

type StageKey = 'not_started' | 'dl_doc' | 'dl_impl' | 'gtm' | 'passed'

const STAGE_FILTERS: { key: StageKey; label: string; dotColor: string }[] = [
  { key: 'not_started', label: 'Not started',           dotColor: 'bg-slate-400' },
  { key: 'dl_doc',      label: 'dataLayer doc done',    dotColor: 'bg-blue-400' },
  { key: 'dl_impl',     label: 'dataLayer implemented', dotColor: 'bg-indigo-400' },
  { key: 'gtm',         label: 'GTM work done',         dotColor: 'bg-amber-400' },
  { key: 'passed',      label: 'Work passed',           dotColor: 'bg-green-500' },
]

const SORT_OPTIONS = [
  { value: 'name_asc',      label: 'Name A–Z' },
  { value: 'name_desc',     label: 'Name Z–A' },
  { value: 'category_asc',  label: 'Category A–Z' },
  { value: 'category_desc', label: 'Category Z–A' },
  { value: 'fires_desc',    label: 'Most fired' },
  { value: 'fires_asc',     label: 'Least fired' },
  { value: 'stage_asc',     label: 'Stage: earliest first' },
  { value: 'stage_desc',    label: 'Stage: latest first' },
]

interface Props {
  defaultQ: string
  defaultFilter: string
  defaultStage: string
  defaultGa4: string
  defaultSort: string
  stageCounts: Record<StageKey, number>
  notFiredCount: number
}

export default function EventsSearch({
  defaultQ,
  defaultFilter,
  defaultStage,
  defaultGa4,
  defaultSort,
  stageCounts,
  notFiredCount,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const update = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, val] of Object.entries(updates)) {
        if (val) params.set(key, val)
        else params.delete(key)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const typeFilters = [
    { value: '', label: 'All' },
    { value: 'keyEvent', label: 'Key events' },
    { value: 'dataLayer', label: 'Needs dataLayer' },
  ]

  const isNotFired = defaultGa4 === 'notFired'

  const activeSort = defaultSort || 'name_asc'

  return (
    <div className="space-y-3">
      {/* Search + type filters + sort */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search events..."
          defaultValue={defaultQ}
          onChange={(e) => update({ q: e.target.value })}
          className="max-w-xs"
        />
        <div className="flex gap-1 flex-wrap">
          {typeFilters.map((f) => (
            <Button
              key={f.value}
              variant={defaultFilter === f.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => update({ filter: f.value })}
            >
              {f.label}
            </Button>
          ))}
          {/* Not fired filter — only shown after at least one GA4 check */}
          {notFiredCount > 0 || isNotFired ? (
            <Button
              variant={isNotFired ? 'default' : 'outline'}
              size="sm"
              className={isNotFired ? '' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}
              onClick={() => update({ ga4: isNotFired ? '' : 'notFired', filter: '' })}
            >
              ⚠️ Not fired ({notFiredCount})
            </Button>
          ) : null}
        </div>

        {/* Sort control */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-muted-foreground shrink-0">Sort:</span>
          <select
            value={activeSort}
            onChange={(e) => update({ sort: e.target.value === 'name_asc' ? '' : e.target.value })}
            className="h-8 text-xs border border-input rounded-md px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stage filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Stage:</span>
        <Button
          variant={defaultStage === '' ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs px-2.5"
          onClick={() => update({ stage: '' })}
        >
          All
        </Button>
        {STAGE_FILTERS.filter((s) => stageCounts[s.key] > 0 || defaultStage === s.key).map((s) => (
          <Button
            key={s.key}
            variant={defaultStage === s.key ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs px-2.5 gap-1.5"
            onClick={() => update({ stage: defaultStage === s.key ? '' : s.key })}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${s.dotColor} shrink-0`} />
            {s.label}
            <span className="text-muted-foreground">({stageCounts[s.key]})</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
