'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import CodeBlockEditor from './CodeBlockEditor'
import ParameterTable from './ParameterTable'
import StatusControls from './StatusControls'
import CommentsPanel from './CommentsPanel'
import ScreenshotPanel from './ScreenshotPanel'
import EcommerceEditor from './EcommerceEditor'
import EcommerceFieldsTable from './EcommerceFieldsTable'
import type { Section, Screenshot } from './types'

interface Props {
  section:          Section
  apiBase:          string
  allCategories:    string[]
  canMoveUp:        boolean
  canMoveDown:      boolean
  hideEcommerce?:   boolean   // when true: ecommerce panels shown at category level instead
  onUpdate:         (updates: Partial<Section>) => void
  onDelete:         () => void
  onMoveUp:         () => void
  onMoveDown:       () => void
  onCopyEcommerce?: () => Promise<number>
  onMove:           (newCategory: string) => Promise<void>
}

export default function DataLayerSectionCard({
  section, apiBase, allCategories, canMoveUp, canMoveDown,
  hideEcommerce = false,
  onUpdate, onDelete, onMoveUp, onMoveDown, onCopyEcommerce, onMove,
}: Props) {
  const sectionUrl  = `${apiBase}/datalayer/sections/${section.id}`
  const isEcommerce = (section.event.category ?? '').toLowerCase() === 'ecommerce'

  const [deleting, setDeleting]           = useState(false)
  const [moving, setMoving]               = useState(false)
  const [copyMsg, setCopyMsg]             = useState<string | null>(null)

  // Inline trigger edit
  const [editingTrigger, setEditingTrigger] = useState(false)
  const [triggerValue, setTriggerValue]     = useState(section.event.trigger ?? '')
  const [savingTrigger, setSavingTrigger]   = useState(false)

  // Inline event name (title) edit
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue]     = useState(section.event.name)
  const [savingName, setSavingName]   = useState(false)

  // Split screenshots by context
  const triggerScreenshots = (section.screenshots ?? []).filter((s) => s.context === 'trigger')
  const testScreenshots    = (section.screenshots ?? []).filter((s) => s.context !== 'trigger')

  async function handleDelete() {
    if (!confirm(`Remove "${section.event.name}" from the documentation?`)) return
    setDeleting(true)
    const res = await fetch(sectionUrl, { method: 'DELETE' })
    if (res.ok || res.status === 204) onDelete()
    setDeleting(false)
  }

  async function handleMove(newCategory: string) {
    if (!newCategory || newCategory === section.event.category) return
    setMoving(true)
    try { await onMove(newCategory) } finally { setMoving(false) }
  }

  async function handleCopyEcommerce() {
    if (!onCopyEcommerce) return
    setCopyMsg(null)
    const updated = await onCopyEcommerce()
    setCopyMsg(updated > 0 ? `Copied to ${updated} other event${updated !== 1 ? 's' : ''}` : 'No other ecommerce events to copy to')
    setTimeout(() => setCopyMsg(null), 4000)
  }

  async function commitTrigger() {
    const val = triggerValue.trim()
    setEditingTrigger(false)
    if (val === (section.event.trigger ?? '')) return
    setSavingTrigger(true)
    try {
      const res = await fetch(`${apiBase}/events/${section.event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: val }),
      })
      if (res.ok) {
        onUpdate({ event: { ...section.event, trigger: val } })
      }
    } finally {
      setSavingTrigger(false)
    }
  }

  async function commitName() {
    const val = nameValue.trim()
    setEditingName(false)
    if (!val || val === section.event.name) {
      setNameValue(section.event.name)
      return
    }
    setSavingName(true)
    try {
      const res = await fetch(`${apiBase}/events/${section.event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: val }),
      })
      if (res.ok) {
        onUpdate({ event: { ...section.event, name: val } })
        // Event name is embedded in the generated code block (`event:`/`action:`) —
        // regenerate it to match, unless it's been hand-edited.
        if (!section.codeBlockCustomised) {
          const regen = await fetch(`${sectionUrl}/regenerate`, { method: 'POST' })
          if (regen.ok) {
            const updated = await regen.json()
            onUpdate({ codeBlock: updated.codeBlock, codeBlockCustomised: false })
          }
        }
      } else {
        setNameValue(section.event.name)
      }
    } finally {
      setSavingName(false)
    }
  }

  function handleScreenshotUpdate(context: 'trigger' | 'test', updated: Screenshot[]) {
    const other = context === 'trigger' ? testScreenshots : triggerScreenshots
    onUpdate({ screenshots: [...other, ...updated] })
  }

  async function handleRemoveParam(parameterId: string) {
    const res = await fetch(
      `${apiBase}/events/${section.event.id}/parameters?parameterId=${parameterId}`,
      { method: 'DELETE' }
    )
    if (!res.ok) return
    // Remove from local state
    const newParams = (section.event.parameters ?? []).filter(
      (ep) => ep.parameterId !== parameterId
    )
    onUpdate({ event: { ...section.event, parameters: newParams } })
    // Regenerate code block if not customised
    if (!section.codeBlockCustomised) {
      const regen = await fetch(`${sectionUrl}/regenerate`, { method: 'POST' })
      if (regen.ok) {
        const updated = await regen.json()
        onUpdate({ codeBlock: updated.codeBlock, codeBlockCustomised: false })
      }
    }
  }

  return (
    <Card className="overflow-hidden" id={`section-${section.id}`}>
      <CardHeader className="pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-1">
                {section.event.category && (
                  <span className="text-base font-mono text-muted-foreground shrink-0">
                    custom.{section.event.category}.
                  </span>
                )}
                <input
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 py-0.5 text-base font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') { setEditingName(false); setNameValue(section.event.name) }
                  }}
                  autoFocus
                  disabled={savingName}
                />
              </div>
            ) : (
              <button
                className="w-full text-left group"
                onClick={() => { setNameValue(section.event.name); setEditingName(true) }}
                title="Click to edit event name"
              >
                <CardTitle className="text-base font-mono truncate">
                  {section.event.category
                    ? `custom.${section.event.category ?? ''}.${section.event.name}`
                    : section.event.name}
                  <span className="ml-1 opacity-0 group-hover:opacity-50 text-xs align-middle">✎</span>
                </CardTitle>
              </button>
            )}

            {/* Trigger — inline editable */}
            <div className="mt-2">
              {editingTrigger ? (
                <textarea
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={3}
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                  onBlur={commitTrigger}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setEditingTrigger(false); setTriggerValue(section.event.trigger ?? '') }
                  }}
                  autoFocus
                  disabled={savingTrigger}
                  placeholder="Describe when this event fires…"
                />
              ) : (
                <button
                  className="w-full text-left group"
                  onClick={() => { setTriggerValue(section.event.trigger ?? ''); setEditingTrigger(true) }}
                  title="Click to edit trigger"
                  data-print-hide={undefined}
                >
                  {section.event.trigger ? (
                    <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                      <span className="font-medium text-foreground">Trigger:</span>{' '}
                      {section.event.trigger}
                      <span className="ml-1 opacity-0 group-hover:opacity-50 text-xs">✎</span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic group-hover:text-foreground transition-colors" data-print-hide>
                      + Add trigger…
                    </p>
                  )}
                </button>
              )}
            </div>

            {/* Trigger screenshots (always available) */}
            <div className="mt-2" data-print-hide>
              <ScreenshotPanel
                sectionId={section.id}
                screenshots={triggerScreenshots}
                screenshotsUrl={`${sectionUrl}/screenshots`}
                context="trigger"
                onUpdate={(shots) => handleScreenshotUpdate('trigger', shots)}
              />
            </div>
          </div>

          {/* Action buttons column */}
          <div className="flex flex-col gap-1 shrink-0 items-end" data-print-hide>
            {/* Status badges */}
            <div className="flex flex-wrap gap-1.5 justify-end">
              {section.isDone && (
                <Badge variant="outline" className="text-xs border-green-600 text-green-700 bg-green-50">✓ Done</Badge>
              )}
              {section.isTested && (
                <Badge variant="outline" className="text-xs border-blue-600 text-blue-700 bg-blue-50">✓ Tested</Badge>
              )}
              {section.testResult === 'passed' && (
                <Badge variant="outline" className="text-xs border-green-600 text-green-700 bg-green-50">✓ Passed</Badge>
              )}
              {section.testResult === 'failed' && (
                <Badge variant="outline" className="text-xs border-red-600 text-red-700 bg-red-50">✗ Failed</Badge>
              )}
              {section.codeBlockCustomised && (
                <Badge variant="outline" className="text-xs text-muted-foreground">Edited</Badge>
              )}
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-1 mt-1">
              {/* Up/down reorder */}
              <Button
                variant="ghost" size="sm"
                className="h-6 w-6 p-0 text-muted-foreground"
                onClick={onMoveUp}
                disabled={!canMoveUp}
                title="Move up"
              >▲</Button>
              <Button
                variant="ghost" size="sm"
                className="h-6 w-6 p-0 text-muted-foreground"
                onClick={onMoveDown}
                disabled={!canMoveDown}
                title="Move down"
              >▼</Button>

              {/* Move to category */}
              {allCategories.length > 1 && (
                <select
                  className="h-6 rounded border border-input bg-background px-1.5 text-xs text-muted-foreground cursor-pointer disabled:opacity-50"
                  value=""
                  disabled={moving}
                  onChange={(e) => handleMove(e.target.value)}
                  title="Move to category"
                >
                  <option value="" disabled>Move to…</option>
                  {allCategories
                    .filter((c) => c !== (section.event.category ?? ''))
                    .map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                </select>
              )}

              <Button
                variant="ghost" size="sm"
                className="h-6 text-xs px-2 text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? '…' : 'Remove'}
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-5">
        {/* Ecommerce panels — only shown per-card when NOT lifted to category level */}
        {isEcommerce && !hideEcommerce && (
          <EcommerceFieldsTable
            sectionId={section.id}
            ecommerceJson={section.ecommerceJson}
            notes={section.ecommerceNotes ?? []}
            sectionUrl={sectionUrl}
            onNotesChange={(ecommerceNotes) => onUpdate({ ecommerceNotes })}
            onCopy={onCopyEcommerce ? handleCopyEcommerce : undefined}
            copyMessage={copyMsg}
          />
        )}
        {isEcommerce && !hideEcommerce && (
          <EcommerceEditor
            sectionId={section.id}
            ecommerceJson={section.ecommerceJson}
            sectionUrl={sectionUrl}
            onUpdate={(ecommerceJson, codeBlock) =>
              onUpdate({ ecommerceJson, codeBlock, codeBlockCustomised: false })
            }
          />
        )}

        {/* Code block */}
        <CodeBlockEditor
          sectionId={section.id}
          codeBlock={section.codeBlock}
          customised={section.codeBlockCustomised}
          sectionUrl={sectionUrl}
          onUpdate={(codeBlock, codeBlockCustomised) =>
            onUpdate({ codeBlock, codeBlockCustomised })
          }
        />

        {/* Parameter table */}
        {(section.event.parameters ?? []).length > 0 && (
          <ParameterTable
            sectionId={section.id}
            eventId={section.event.id}
            params={(section.event.parameters ?? []).map((ep) => ({
              ...ep.parameter,
              parameterId: ep.parameterId,
              value: ep.value ?? 'dynamic',
            }))}
            paramNotes={section.paramNotes}
            sectionUrl={sectionUrl}
            eventsApiUrl={apiBase}
            codeBlockCustomised={section.codeBlockCustomised}
            onNotesChange={(paramNotes) => onUpdate({ paramNotes })}
            onCodeBlockUpdate={(codeBlock) =>
              onUpdate({ codeBlock, codeBlockCustomised: false })
            }
            onRemoveParam={handleRemoveParam}
          />
        )}

        {/* Status controls */}
        <StatusControls
          sectionId={section.id}
          isDone={section.isDone}
          isTested={section.isTested}
          testResult={section.testResult}
          sectionUrl={sectionUrl}
          onUpdate={(updates) => onUpdate(updates)}
        />

        {/* Test failure screenshots */}
        {section.testResult === 'failed' && (
          <ScreenshotPanel
            sectionId={section.id}
            screenshots={testScreenshots}
            screenshotsUrl={`${sectionUrl}/screenshots`}
            context="test"
            onUpdate={(shots) => handleScreenshotUpdate('test', shots)}
          />
        )}

        {/* Comments */}
        <CommentsPanel
          sectionId={section.id}
          comments={section.comments}
          commentsUrl={`${sectionUrl}/comments`}
          onUpdate={(comments) => onUpdate({ comments })}
        />
      </CardContent>
    </Card>
  )
}
