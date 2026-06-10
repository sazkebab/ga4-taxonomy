'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PageGroup { id: string; name: string; pattern: string; color: string; order: number }

interface Props {
  apiBase:          string
  groups:           PageGroup[]
  bqTable:          string
  onChange:         (groups: PageGroup[]) => void
  onBqTableChange:  (table: string) => void
}

const DEFAULT_COLORS = [
  '#315D9C', '#3DB9BD', '#D6401A', '#FEBB15', '#6366f1',
  '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6',
]

export default function JourneySettings({ apiBase, groups, bqTable, onChange, onBqTableChange }: Props) {
  const [bqInput,   setBqInput]   = useState(bqTable)
  const [bqSaving,  setBqSaving]  = useState(false)
  const [bqSaved,   setBqSaved]   = useState(false)

  async function saveBqTable() {
    setBqSaving(true)
    // Extract projectId from apiBase: /api/clients/[clientId]/projects/[projectId]
    await fetch(apiBase, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bqJourneyTable: bqInput.trim() }),
    })
    onBqTableChange(bqInput.trim())
    setBqSaving(false); setBqSaved(true)
    setTimeout(() => setBqSaved(false), 2000)
  }

  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<PageGroup | null>(null)
  const [name,     setName]     = useState('')
  const [pattern,  setPattern]  = useState('')
  const [color,    setColor]    = useState('')
  const [saving,   setSaving]   = useState(false)

  function resetForm() {
    setShowForm(false); setEditing(null)
    setName(''); setPattern(''); setColor('')
  }

  function startEdit(g: PageGroup) {
    setEditing(g); setName(g.name); setPattern(g.pattern); setColor(g.color)
    setShowForm(true)
  }

  async function save() {
    if (!name.trim() || !pattern.trim()) return
    setSaving(true)
    const pickedColor = color || DEFAULT_COLORS[groups.length % DEFAULT_COLORS.length]
    try {
      if (editing) {
        await fetch(`${apiBase}/journey/groups/${editing.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), pattern: pattern.trim(), color: pickedColor }),
        })
        onChange(groups.map((g) => g.id === editing.id ? { ...g, name: name.trim(), pattern: pattern.trim(), color: pickedColor } : g))
      } else {
        const res  = await fetch(`${apiBase}/journey/groups`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), pattern: pattern.trim(), color: pickedColor }),
        })
        const newG = await res.json()
        onChange([...groups, newG])
      }
      resetForm()
    } finally { setSaving(false) }
  }

  async function remove(id: string) {
    if (!confirm('Delete this page group?')) return
    await fetch(`${apiBase}/journey/groups/${id}`, { method: 'DELETE' })
    onChange(groups.filter((g) => g.id !== id))
  }

  async function move(id: string, dir: 'up' | 'down') {
    const idx = groups.findIndex((g) => g.id === id)
    if (idx < 0) return
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= groups.length) return
    const reordered = [...groups]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
    // Update orders
    await Promise.all([
      fetch(`${apiBase}/journey/groups/${reordered[idx].id}`,     { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: idx }) }),
      fetch(`${apiBase}/journey/groups/${reordered[swapIdx].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: swapIdx }) }),
    ])
    onChange(reordered.map((g, i) => ({ ...g, order: i })))
  }

  return (
    <div className="max-w-2xl space-y-8">

      {/* BigQuery data source */}
      <div>
        <h3 className="font-semibold mb-1">Data source</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Connect a BigQuery table for full multi-step journey paths. Without it, the map uses GA4's pageReferrer dimension which only shows 1 step.
        </p>

        <div className="border rounded-lg p-4 bg-muted/10 space-y-3">
          <div className="space-y-1.5">
            <Label>BigQuery table path</Label>
            <div className="flex gap-2">
              <Input
                value={bqInput}
                onChange={(e) => setBqInput(e.target.value)}
                placeholder="your-project.analytics_123456.ga4_journey"
                className="font-mono text-sm"
              />
              <Button size="sm" onClick={saveBqTable} disabled={bqSaving}>
                {bqSaved ? '✓ Saved' : bqSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Format: <code>gcp-project.dataset.table_name</code>
            </p>
          </div>

          {!bqTable && (
            <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2.5 space-y-1.5">
              <p className="font-medium">How to set up the BigQuery table:</p>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>Enable GA4 BigQuery export in your GA4 property (Admin → BigQuery linking)</li>
                <li>Run the SQL query below in BigQuery to create the journey table</li>
                <li>Paste the table path above and save</li>
                <li>Re-authorise Google (⚙️ main menu) so the BigQuery scope is granted</li>
              </ol>
            </div>
          )}

          {/* SQL template */}
          <details className="group">
            <summary className="text-xs font-medium cursor-pointer text-primary hover:underline">
              {bqTable ? 'View BigQuery SQL template' : 'Show BigQuery SQL to run first ↓'}
            </summary>
            <pre className="mt-2 text-xs bg-background border rounded p-3 overflow-x-auto leading-relaxed whitespace-pre">{BQ_SQL}</pre>
            <p className="text-xs text-muted-foreground mt-1">
              Replace <code>your-project.analytics_XXXXXXX</code> with your GA4 BigQuery export dataset. The table will be created / refreshed each time you run the query.
            </p>
          </details>
        </div>
      </div>

      {/* Page groups */}
      <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold">Page groups</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Group URLs into named segments for a cleaner journey map. Rules are matched in order — first match wins.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>+ Add group</Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="border rounded-lg p-4 mb-5 bg-muted/10 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Group name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Products" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>URL pattern</Label>
              <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. /products/*" />
              <p className="text-xs text-muted-foreground">Use <code>/*</code> for prefix match, exact path for exact match</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Colour <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <div className="flex items-center gap-2">
              <input type="color" value={color || DEFAULT_COLORS[groups.length % DEFAULT_COLORS.length]}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-10 rounded border cursor-pointer" />
              <span className="text-xs text-muted-foreground">{color || DEFAULT_COLORS[groups.length % DEFAULT_COLORS.length]}</span>
              {/* Quick palette */}
              <div className="flex gap-1 ml-2">
                {DEFAULT_COLORS.slice(0, 6).map((c) => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`h-5 w-5 rounded-full border-2 ${color === c ? 'border-foreground' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>

          {/* Pattern preview */}
          {pattern && (
            <div className="text-xs bg-muted/30 rounded px-3 py-2">
              <span className="text-muted-foreground">Matches: </span>
              {pattern.endsWith('/*')
                ? <code>{pattern.slice(0, -2)}/…</code>
                : <code>{pattern}</code>}
              {' '}→ <strong>{name || '(name)'}</strong>
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving || !name.trim() || !pattern.trim()}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Add group'}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Group list */}
      {groups.length === 0 && !showForm ? (
        <div className="text-center py-12 text-muted-foreground text-sm border rounded-lg">
          <p className="text-2xl mb-2">📄</p>
          <p className="font-medium">No page groups yet</p>
          <p className="text-xs mt-1">Without groups the journey map shows raw URLs.<br />Add groups to collapse similar pages into named segments.</p>
          <Button size="sm" className="mt-4" onClick={() => setShowForm(true)}>+ Add your first group</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g, i) => (
            <div key={g.id} className="flex items-center gap-3 border rounded-lg px-3 py-2.5 bg-background">
              <span className="h-4 w-4 rounded shrink-0" style={{ backgroundColor: g.color || '#ccc' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{g.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{g.pattern}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => move(g.id, 'up')}   disabled={i === 0}              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 px-1">↑</button>
                <button onClick={() => move(g.id, 'down')} disabled={i === groups.length - 1} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 px-1">↓</button>
                <button onClick={() => startEdit(g)} className="text-xs text-muted-foreground hover:text-foreground px-1">Edit</button>
                <button onClick={() => remove(g.id)} className="text-xs text-muted-foreground hover:text-destructive px-1">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 text-xs text-muted-foreground space-y-1 border-t pt-4">
        <p><strong>Pattern examples:</strong></p>
        <p><code>/</code> — Homepage only</p>
        <p><code>/products/*</code> — Any URL starting with /products/</p>
        <p><code>/checkout/confirmation</code> — Exact match only</p>
        <p>Rules are checked in the order shown. First match wins.</p>
      </div>
      </div>  {/* end page groups */}
    </div>
  )
}

// ─── BigQuery SQL template ────────────────────────────────────────────────────

const BQ_SQL = `-- Run this in BigQuery to create your journey table.
-- Replace 'your-project.analytics_XXXXXXX' with your GA4 export dataset.
-- Each row = one unique path through the site, up to 8 pages.

CREATE OR REPLACE TABLE \`your-project.analytics_XXXXXXX.ga4_journey\` AS
WITH page_views AS (
  SELECT
    CONCAT(
      user_pseudo_id, '.',
      CAST((SELECT value.int_value FROM UNNEST(event_params)
            WHERE key = 'ga_session_id') AS STRING)
    ) AS session_key,
    event_timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY
        user_pseudo_id,
        (SELECT value.int_value FROM UNNEST(event_params)
         WHERE key = 'ga_session_id')
      ORDER BY event_timestamp
    ) AS step,
    -- Extract path only (no domain, no query string), lowercase for consistency.
    LOWER(COALESCE(
      REGEXP_EXTRACT(
        (SELECT value.string_value FROM UNNEST(event_params)
         WHERE key = 'page_location'),
        r'^https?://[^/?#]+(/[^?#]*)'
      ),
      '/'
    )) AS page_path
  FROM \`your-project.analytics_XXXXXXX.events_*\`
  WHERE event_name = 'page_view'
    AND _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d',
        DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
),
pivoted AS (
  SELECT
    session_key,
    MAX(IF(step = 1, page_path, NULL)) AS page_1,
    MAX(IF(step = 2, page_path, NULL)) AS page_2,
    MAX(IF(step = 3, page_path, NULL)) AS page_3,
    MAX(IF(step = 4, page_path, NULL)) AS page_4,
    MAX(IF(step = 5, page_path, NULL)) AS page_5,
    MAX(IF(step = 6, page_path, NULL)) AS page_6,
    MAX(IF(step = 7, page_path, NULL)) AS page_7,
    MAX(IF(step = 8, page_path, NULL)) AS page_8
  FROM page_views
  WHERE page_path IS NOT NULL
  GROUP BY session_key
)
SELECT
  page_1, page_2, page_3, page_4,
  page_5, page_6, page_7, page_8,
  COUNT(*) AS users
FROM pivoted
WHERE page_1 IS NOT NULL
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
HAVING users >= 2
ORDER BY users DESC;`
