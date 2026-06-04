'use client'

import { useState } from 'react'
import { ResponsiveSunburst } from '@nivo/sunburst'

interface PageGroup { name: string; color: string }
interface NivoNode  { name: string; value?: number; color?: string; children?: NivoNode[] }

interface Props {
  tree:       NivoNode
  groups:     PageGroup[]
  totalUsers: number
}

// Default colour palette for ungrouped paths
const PALETTE = [
  '#315D9C', '#3DB9BD', '#D6401A', '#FEBB15', '#6366f1',
  '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6',
  '#f97316', '#06b6d4', '#84cc16', '#a855f7', '#ef4444',
]

/** Assign deterministic colours to nodes that don't have an explicit group colour */
function colouriseTree(node: NivoNode, groups: PageGroup[], depth = 0, colourMap = new Map<string, string>()): NivoNode {
  const groupColor = groups.find((g) => g.name === node.name)?.color
  if (!colourMap.has(node.name) && depth > 0) {
    colourMap.set(node.name, groupColor || PALETTE[colourMap.size % PALETTE.length])
  }
  const color = depth === 0 ? undefined : colourMap.get(node.name)
  return {
    ...node,
    color,
    children: node.children?.map((c) => colouriseTree(c, groups, depth + 1, colourMap)),
  }
}

/** Flatten tree into a unique list of (name, color) for the legend */
function extractLegendItems(node: NivoNode, seen = new Set<string>(), items: { name: string; color: string }[] = []): { name: string; color: string }[] {
  if (node.name !== 'All sessions' && !seen.has(node.name)) {
    seen.add(node.name)
    items.push({ name: node.name, color: node.color ?? '#999' })
  }
  node.children?.forEach((c) => extractLegendItems(c, seen, items))
  return items
}

/** Sum all values in a subtree */
function treeTotal(node: NivoNode): number {
  if (!node.children?.length) return node.value ?? 0
  return node.children.reduce((s, c) => s + treeTotal(c), 0)
}

export default function JourneyChart({ tree, groups, totalUsers }: Props) {
  const [tooltip, setTooltip] = useState<{ name: string; value: number; pct: string } | null>(null)
  const coloured    = colouriseTree(tree, groups)
  const legendItems = extractLegendItems(coloured).slice(0, 20)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_240px] gap-6 items-start">
      {/* Sunburst */}
      <div className="relative">
        <div className="h-[520px]">
          <ResponsiveSunburst
            data={coloured}
            margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
            id="name"
            value="value"
            cornerRadius={3}
            borderWidth={2}
            borderColor="white"
            colors={(node) => (node.data as NivoNode).color ?? '#e5e7eb'}
            childColor={{ from: 'color', modifiers: [['brighter', 0.2]] }}
            enableArcLabels={true}
            arcLabelsSkipAngle={12}
            arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
            arcLabel={(d) => {
              const v = d.value ?? 0
              const pct = totalUsers > 0 ? ((v / totalUsers) * 100).toFixed(0) : '0'
              return pct + '%'
            }}
            onClick={(node) => {
              const v = node.value ?? 0
              const pct = totalUsers > 0 ? ((v / totalUsers) * 100).toFixed(1) + '%' : '—'
              setTooltip({ name: node.id as string, value: v, pct })
            }}
            tooltip={({ id, value }) => (
              <div className="bg-popover border rounded px-3 py-2 text-sm shadow-md">
                <p className="font-medium">{id as string}</p>
                <p className="text-muted-foreground">
                  {value?.toLocaleString()} users ({totalUsers > 0 ? ((value! / totalUsers) * 100).toFixed(1) : 0}%)
                </p>
              </div>
            )}
          />
        </div>

        {/* Centre label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            {tooltip ? (
              <>
                <p className="text-xs text-muted-foreground truncate max-w-[100px]">{tooltip.name}</p>
                <p className="text-xl font-bold">{tooltip.pct}</p>
                <p className="text-xs text-muted-foreground">{tooltip.value.toLocaleString()} users</p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{totalUsers.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">users</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="sticky top-6 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Page groups</p>
        {legendItems.map((item) => (
          <div key={item.name} className="flex items-center gap-2.5 py-1.5 border-b last:border-0">
            <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-xs truncate flex-1">{item.name}</span>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Showing raw URLs. Add page groups in ⚙️ Settings to group similar pages.</p>
        )}
        <p className="text-xs text-muted-foreground mt-3">Click a segment to see its detail</p>
      </div>
    </div>
  )
}
