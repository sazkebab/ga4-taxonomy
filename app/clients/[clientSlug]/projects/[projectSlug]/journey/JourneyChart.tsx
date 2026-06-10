'use client'

import { useState } from 'react'
import { ResponsiveSunburst } from '@nivo/sunburst'

interface PageGroup { name: string; color: string }
interface NivoNode  { id: string; name: string; value?: number; color?: string; children?: NivoNode[] }

interface Props {
  tree:       NivoNode
  groups:     PageGroup[]
  totalUsers: number
}

const PALETTE = [
  '#315D9C', '#D6401A', '#3DB9BD', '#FEBB15', '#6366f1',
  '#10b981', '#f97316', '#ec4899', '#8b5cf6', '#06b6d4',
  '#84cc16', '#a855f7', '#14b8a6', '#f59e0b', '#ef4444',
  '#0ea5e9', '#22c55e', '#e879f9', '#fb923c', '#38bdf8',
]

/** Deterministic colour from name — same page always gets the same colour */
function pageColour(name: string, groups: PageGroup[]): string {
  if (name === '(exit)')  return '#d1d5db'
  if (name === '(other)') return '#e5e7eb'
  const group = groups.find((g) => g.name === name)
  if (group?.color) return group.color
  // Simple string hash → stable palette index
  let h = 0
  for (let i = 0; i < name.length; i++) { h = Math.imul(31, h) + name.charCodeAt(i) | 0 }
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function colouriseTree(node: NivoNode, groups: PageGroup[], depth = 0): NivoNode {
  const color = depth === 0 ? undefined : pageColour(node.name, groups)
  return {
    ...node,
    color,
    children: node.children?.map((c) => colouriseTree(c, groups, depth + 1)),
  }
}

function extractLegendItems(node: NivoNode, groups: PageGroup[], seen = new Set<string>(), items: { name: string; color: string }[] = []): { name: string; color: string }[] {
  if (node.name !== 'All sessions' && !seen.has(node.name)) {
    seen.add(node.name)
    items.push({ name: node.name, color: pageColour(node.name, groups) })
  }
  node.children?.forEach((c) => extractLegendItems(c, groups, seen, items))
  return items
}

function sumChildren(node: NivoNode): number {
  if (!node.children?.length) return node.value ?? 0
  return node.children.reduce((s, c) => s + sumChildren(c), 0)
}

export default function JourneyChart({ tree, groups, totalUsers }: Props) {
  const coloured    = colouriseTree(tree, groups)
  const allLegendItems = extractLegendItems(coloured, groups)
  // Always put (exit) and (other) at the end; limit pages to 20
  const specialItems  = allLegendItems.filter((i) => i.name === '(exit)' || i.name === '(other)')
  const pageItems     = allLegendItems.filter((i) => i.name !== '(exit)' && i.name !== '(other)')
  const legendItems   = [...pageItems.slice(0, 18), ...specialItems]
  const total       = totalUsers || sumChildren(tree)

  // Zoom state — tracks which node is currently the "root" of the displayed sunburst
  const [zoomId,   setZoomId]   = useState<string | null>(null)
  const [centreNode, setCentreNode] = useState<{ name: string; value: number } | null>(null)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_240px] gap-6 items-start">
      {/* Sunburst */}
      <div className="relative">
        <div className="h-[520px]">
          <ResponsiveSunburst
            data={coloured}
            margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
            id="id"
            value="value"
            cornerRadius={3}
            borderWidth={2}
            borderColor="white"
            colors={(node) => pageColour((node.data as NivoNode).name, groups)}
            childColor={(_, child) => pageColour((child.data as NivoNode).name, groups)}
            enableArcLabels={true}
            arcLabelsSkipAngle={14}
            arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2.5]] }}
            arcLabel={(d) => {
              if (!d.value || !total) return ''
              const pct = (d.value / total) * 100
              if (pct < 4) return ''
              const name = (d.data as NivoNode).name
              return name === '(exit)' ? '↩' : pct.toFixed(0) + '%'
            }}
            isInteractive={true}
            onClick={(node) => {
              const label = (node.data as NivoNode).name
              const value = node.value ?? 0
              setZoomId((prev) => (prev === (node.id as string) ? null : node.id as string))
              setCentreNode({ name: label, value })
            }}
            tooltip={({ id, value, percentage, data }) => (
              <div className="bg-popover border rounded px-3 py-2 text-sm shadow-md max-w-[200px]">
                <p className="font-medium truncate">{(data as NivoNode).name}</p>
                <p className="text-muted-foreground">
                  {(value ?? 0).toLocaleString()} users · {(percentage ?? 0).toFixed(1)}%
                </p>
              </div>
            )}
          />
        </div>

        {/* Centre label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center max-w-[120px]">
            {centreNode ? (
              <>
                <p className="text-xs text-muted-foreground truncate w-full">{centreNode.name}</p>
                <p className="text-2xl font-bold">{total > 0 ? ((centreNode.value / total) * 100).toFixed(1) + '%' : '—'}</p>
                <p className="text-xs text-muted-foreground">{centreNode.value.toLocaleString()} users</p>
                <button
                  className="text-xs text-primary hover:underline mt-1 pointer-events-auto"
                  onClick={() => { setZoomId(null); setCentreNode(null) }}
                >
                  ← Back
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">All sessions</p>
                <p className="text-2xl font-bold">{total.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">users</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="sticky top-6 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {groups.length > 0 ? 'Page groups' : 'Pages'}
        </p>
        {legendItems.map((item) => (
          <div key={item.name} className="flex items-center gap-2.5 py-1.5 border-b last:border-0">
            <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-xs truncate flex-1">{item.name}</span>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-xs text-muted-foreground italic mt-2">
            Showing raw URLs — add page groups in ⚙️ Settings to simplify the view.
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-3 pt-2 border-t">
          Click a segment to focus on it · Click again or use ← Back to zoom out
        </p>
      </div>
    </div>
  )
}
