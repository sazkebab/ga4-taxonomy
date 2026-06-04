'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import JourneyChart from './JourneyChart'
import JourneySettings from './JourneySettings'

interface PageGroup { id: string; name: string; pattern: string; color: string; order: number }
interface NivoNode  { name: string; value?: number; color?: string; children?: NivoNode[] }

interface Props {
  projectId:    string
  apiBase:      string
  initialGroups: PageGroup[]
  initialTab:   'map' | 'settings'
  hasGa4:       boolean
}

const PRESET_RANGES = [
  { label: 'Last 7 days',  start: '7daysAgo',  end: 'yesterday' },
  { label: 'Last 30 days', start: '30daysAgo', end: 'yesterday' },
  { label: 'Last 90 days', start: '90daysAgo', end: 'yesterday' },
]

export default function JourneyClient({ projectId, apiBase, initialGroups, initialTab, hasGa4 }: Props) {
  const router = useRouter()
  const [tab,       setTab]      = useState<'map' | 'settings'>(initialTab)
  const [groups,    setGroups]   = useState(initialGroups)
  const [tree,      setTree]     = useState<NivoNode | null>(null)
  const [total,     setTotal]    = useState(0)
  const [loading,   setLoading]  = useState(false)
  const [error,     setError]    = useState<string | null>(null)

  // Controls
  const [rangeIdx,  setRangeIdx] = useState(1)   // default: last 30 days
  const [maxDepth,  setMaxDepth] = useState(5)
  const [minUsers,  setMinUsers] = useState(20)

  async function loadJourney() {
    setLoading(true)
    setError(null)
    const r = PRESET_RANGES[rangeIdx]
    const url = `${apiBase}/journey/data?startDate=${r.start}&endDate=${r.end}&maxDepth=${maxDepth}&minUsers=${minUsers}`
    try {
      const res  = await fetch(url)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load journey data'); return }
      setTree(data.tree)
      setTotal(data.totalUsers ?? 0)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Journey map</h2>
          <p className="text-sm text-muted-foreground mt-1">
            How users navigate through your site — based on GA4 page referrer data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={tab === 'map'      ? 'default' : 'outline'} size="sm" onClick={() => { setTab('map');      router.push('?tab=map') }}>🗺️ Map</Button>
          <Button variant={tab === 'settings' ? 'default' : 'outline'} size="sm" onClick={() => { setTab('settings'); router.push('?tab=settings') }}>⚙️ Page groups</Button>
        </div>
      </div>

      {!hasGa4 && (
        <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-4 py-2.5">
          ⚠ No GA4 property configured — add one in <strong>GA4 Sync</strong> to enable the journey map.
        </div>
      )}

      {tab === 'map' && (
        <>
          {/* Controls bar */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            {/* Date range */}
            <div className="flex gap-1">
              {PRESET_RANGES.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setRangeIdx(i)}
                  className={[
                    'text-xs px-3 py-1.5 rounded-md border transition-colors',
                    rangeIdx === i ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted/40',
                  ].join(' ')}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs text-muted-foreground shrink-0">Depth:</span>
              <select
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
                className="h-8 text-xs border border-input rounded px-2 bg-background"
              >
                {[2,3,4,5,6,7,8].map((d) => <option key={d} value={d}>{d} steps</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Min users:</span>
              <Input
                type="number"
                value={minUsers}
                onChange={(e) => setMinUsers(Math.max(1, Number(e.target.value)))}
                className="h-8 w-20 text-xs"
                min={1}
              />
            </div>

            <Button onClick={loadJourney} disabled={loading || !hasGa4} size="sm" className="ml-auto">
              {loading ? '⏳ Loading…' : tree ? '↺ Reload' : '▶ Load journey'}
            </Button>
          </div>

          {error && (
            <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-4 py-2.5">
              {error}
            </div>
          )}

          {groups.length === 0 && !tree && (
            <div className="mb-4 text-sm bg-blue-50 border border-blue-200 text-blue-800 rounded px-4 py-3">
              <strong>Tip:</strong> The map will show raw URLs by default. Switch to <strong>⚙️ Page groups</strong> to group URLs like <code>/products/*</code> → "Products" for a cleaner view.
            </div>
          )}

          {tree ? (
            <JourneyChart tree={tree} groups={groups} totalUsers={total} />
          ) : !loading && (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <p className="text-4xl mb-3">🗺️</p>
              <p className="font-medium">No journey data loaded yet</p>
              <p className="text-sm mt-1">Click <strong>Load journey</strong> to fetch GA4 navigation data</p>
            </div>
          )}

          {tree && (
            <p className="text-xs text-muted-foreground mt-6 border-t pt-4">
              Based on GA4 <code>pageReferrer</code> data. Best suited for traditional multi-page sites — SPA navigation without full page reloads may undercount internal transitions. Figures should be verified in GA4.
            </p>
          )}
        </>
      )}

      {tab === 'settings' && (
        <JourneySettings
          apiBase={apiBase}
          groups={groups}
          onChange={setGroups}
        />
      )}
    </div>
  )
}
