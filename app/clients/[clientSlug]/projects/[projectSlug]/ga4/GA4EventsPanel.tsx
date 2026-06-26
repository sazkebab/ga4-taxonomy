'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'

interface GA4EventsResult {
  undocumented: string[]
  documented: string[]
  total: number
}

interface Props {
  eventsUrl: string
  eventsBase: string
}

export default function GA4EventsPanel({ eventsUrl, eventsBase }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GA4EventsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)

  const fetch_ = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setSelected(new Set())

    const res = await fetch(eventsUrl)
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to fetch')
    } else {
      setResult(data)
      // Default to everything selected — the user unticks what they don't want.
      setSelected(new Set<string>(data.undocumented ?? []))
    }
    setLoading(false)
  }

  const allSelected  = !!result && result.undocumented.length > 0 && selected.size === result.undocumented.length
  const someSelected = selected.size > 0 && !allSelected

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else if (result) setSelected(new Set(result.undocumented))
  }

  const addSelected = async () => {
    if (!result || selected.size === 0) return
    setAdding(true)
    const base  = eventsUrl.replace(/\/ga4\/events$/, '')
    const names = result.undocumented.filter((n) => selected.has(n))

    await Promise.all(
      names.map((name) =>
        fetch(`${base}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
      )
    )

    const addedSet = new Set(names)
    setResult({
      ...result,
      undocumented: result.undocumented.filter((n) => !addedSet.has(n)),
      documented:   [...result.documented, ...names],
    })
    setSelected(new Set())
    setAdding(false)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">GA4 Events comparison</CardTitle>
        <CardDescription>
          Compare events firing in GA4 (last 90 days) against your documented events
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={fetch_} disabled={loading} variant="outline">
          {loading ? 'Fetching...' : 'Fetch GA4 events'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {result.total} events in GA4 — {result.documented.length} documented, {result.undocumented.length} undocumented
            </p>

            {result.undocumented.length > 0 && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-amber-600">
                    Undocumented events ({result.undocumented.length})
                  </p>
                  <Button
                    size="sm"
                    className="text-xs h-7"
                    onClick={addSelected}
                    disabled={adding || selected.size === 0}
                  >
                    {adding ? 'Adding…' : `Add ${selected.size} as draft${selected.size !== 1 ? 's' : ''}`}
                  </Button>
                </div>

                {/* Select all */}
                <div className="flex items-center gap-2 mb-2 border-b pb-2">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={toggleAll}
                    id="ga4-select-all"
                  />
                  <label htmlFor="ga4-select-all" className="text-xs text-muted-foreground cursor-pointer select-none">
                    Select all
                  </label>
                </div>

                <div className="space-y-1">
                  {result.undocumented.map((name) => {
                    const isSelected = selected.has(name)
                    return (
                      <div
                        key={name}
                        className={`flex items-center gap-2 text-sm rounded px-1.5 py-1 cursor-pointer transition-colors ${
                          isSelected ? 'bg-accent/20' : 'hover:bg-accent/10'
                        }`}
                        onClick={() => toggle(name)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggle(name)}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                        />
                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{name}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {result.documented.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 text-green-600">
                  Documented events ({result.documented.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.documented.map((name) => (
                    <Badge key={name} variant="outline" className="text-xs font-mono">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
