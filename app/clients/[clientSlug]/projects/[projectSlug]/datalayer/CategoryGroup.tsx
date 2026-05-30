'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import DataLayerSectionCard from './DataLayerSectionCard'
import EcommerceFieldsTable from './EcommerceFieldsTable'
import EcommerceEditor from './EcommerceEditor'
import type { Section } from './types'

interface Props {
  category:         string
  sections:         Section[]
  apiBase:          string
  allCategories:    string[]
  onSectionUpdate:  (sectionId: string, updates: Partial<Section>) => void
  onSectionDelete:  (sectionId: string) => void
  onEventAdded:     (eventId: string, removePending: boolean) => Promise<void>
  onCopyEcommerce:  (sourceSectionId: string) => Promise<number>
  onRename:         (from: string, to: string) => Promise<void>
  onMoveSection:    (sectionId: string, eventId: string, newCategory: string) => Promise<void>
  onReorderSection: (sectionId: string, direction: 'up' | 'down') => void
}

export default function CategoryGroup({
  category,
  sections,
  apiBase,
  allCategories,
  onSectionUpdate,
  onSectionDelete,
  onEventAdded,
  onCopyEcommerce,
  onRename,
  onMoveSection,
  onReorderSection,
}: Props) {
  const [showAddEvent, setShowAddEvent] = useState(sections.length === 0)
  const [eventName, setEventName]       = useState('')
  const [adding, setAdding]             = useState(false)
  const [addError, setAddError]         = useState<string | null>(null)

  // Inline rename state
  const [editingName, setEditingName]   = useState(false)
  const [renameValue, setRenameValue]   = useState(category)
  const [renaming, setRenaming]         = useState(false)
  const renameInputRef                  = useRef<HTMLInputElement>(null)

  // Category-level ecommerce copy message
  const [copyMsg, setCopyMsg]           = useState<string | null>(null)

  const isEcommerce = (category ?? '').toLowerCase() === 'ecommerce'

  // The first section serves as the template for category-level ecommerce editing
  const firstSection = sections.length > 0 ? sections[0] : null
  const firstSectionUrl = firstSection
    ? `${apiBase}/datalayer/sections/${firstSection.id}`
    : ''

  async function commitRename() {
    const newName = renameValue.trim().toLowerCase()
    if (!newName || newName === category) {
      setEditingName(false)
      setRenameValue(category)
      return
    }
    setRenaming(true)
    try {
      await onRename(category, newName)
    } finally {
      setRenaming(false)
      setEditingName(false)
    }
  }

  async function handleAddEvent() {
    const name = eventName.trim()
    if (!name) return
    setAdding(true)
    setAddError(null)
    try {
      const createRes = await fetch(`${apiBase}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, requiresDataLayer: true }),
      })
      if (!createRes.ok) {
        const d = await createRes.json().catch(() => ({}))
        setAddError(d.error?.formErrors?.[0] ?? 'Failed to create event')
        return
      }
      const event = await createRes.json()
      await onEventAdded(event.id, sections.length === 0)
      setEventName('')
      setShowAddEvent(false)
    } finally {
      setAdding(false)
    }
  }

  // When the category-level ecommerce JSON editor saves, update the first section
  // and auto-propagate to all other events in this category.
  async function handleCategoryEcommerceUpdate(newJson: string, newCodeBlock: string) {
    if (!firstSection) return
    onSectionUpdate(firstSection.id, { ecommerceJson: newJson, codeBlock: newCodeBlock, codeBlockCustomised: false })
    if (sections.length > 1) {
      setCopyMsg(null)
      const updated = await onCopyEcommerce(firstSection.id)
      if (updated > 0) {
        setCopyMsg(`Synced to ${updated} other event${updated !== 1 ? 's' : ''}`)
        setTimeout(() => setCopyMsg(null), 3000)
      }
    }
  }

  // Manual "Copy to all" from the fields table
  async function handleManualCopy() {
    if (!firstSection) return
    setCopyMsg(null)
    const updated = await onCopyEcommerce(firstSection.id)
    setCopyMsg(
      updated > 0
        ? `Copied to ${updated} other event${updated !== 1 ? 's' : ''}`
        : 'No other ecommerce events to copy to'
    )
    setTimeout(() => setCopyMsg(null), 4000)
  }

  return (
    <section id={`cat-${category}`}>
      {/* Category header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {editingName ? (
            <input
              ref={renameInputRef}
              className="h-8 rounded-md border border-input bg-background px-3 text-lg font-semibold w-40"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { setEditingName(false); setRenameValue(category) }
              }}
              autoFocus
              disabled={renaming}
            />
          ) : (
            <h3
              className="text-xl font-semibold capitalize cursor-pointer hover:underline decoration-dotted underline-offset-4"
              title="Click to rename category"
              onClick={() => { setRenameValue(category); setEditingName(true) }}
              data-print-hide={undefined}
            >
              {category}
            </h3>
          )}
          {sections.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {sections.length} event{sections.length !== 1 ? 's' : ''}
            </Badge>
          )}
          {isEcommerce && (
            <Badge variant="outline" className="text-xs border-blue-400 text-blue-600">
              GA4 ecommerce
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setShowAddEvent(!showAddEvent)}
          data-print-hide
        >
          + Add event
        </Button>
      </div>

      {/* Add event form */}
      {showAddEvent && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-md bg-muted/40 border border-border" data-print-hide>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">
              Event name — full name will be:{' '}
              <span className="font-mono">custom.{category}.{eventName || '{name}'}</span>
            </p>
            <input
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              placeholder="e.g. view_item"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddEvent() }}
              autoFocus
            />
            {addError && <p className="text-xs text-destructive mt-1">{addError}</p>}
          </div>
          <div className="flex gap-1 self-end">
            <Button size="sm" className="h-8 text-xs" onClick={handleAddEvent} disabled={adding || !eventName.trim()}>
              {adding ? 'Creating…' : 'Create'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowAddEvent(false); setEventName('') }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {sections.length === 0 && !showAddEvent && (
        <p className="text-sm text-muted-foreground italic mb-4">No events yet.</p>
      )}

      {/* ── Category-level ecommerce panel ───────────────────────────────────── */}
      {isEcommerce && firstSection && (
        <div className="mb-6 space-y-3">
          <EcommerceFieldsTable
            sectionId={firstSection.id}
            ecommerceJson={firstSection.ecommerceJson}
            notes={firstSection.ecommerceNotes ?? []}
            sectionUrl={firstSectionUrl}
            onNotesChange={(ecommerceNotes) => onSectionUpdate(firstSection.id, { ecommerceNotes })}
            onCopy={sections.length > 1 ? handleManualCopy : undefined}
            copyMessage={copyMsg}
          />
          <EcommerceEditor
            sectionId={firstSection.id}
            ecommerceJson={firstSection.ecommerceJson}
            sectionUrl={firstSectionUrl}
            onUpdate={handleCategoryEcommerceUpdate}
          />
          {copyMsg && (
            <p className="text-xs text-muted-foreground">{copyMsg}</p>
          )}
        </div>
      )}

      {/* Section cards */}
      <div className="space-y-6">
        {sections.map((section, idx) => (
          <DataLayerSectionCard
            key={section.id}
            section={section}
            apiBase={apiBase}
            allCategories={allCategories}
            canMoveUp={idx > 0}
            canMoveDown={idx < sections.length - 1}
            hideEcommerce={isEcommerce}
            onUpdate={(updates) => onSectionUpdate(section.id, updates)}
            onDelete={() => onSectionDelete(section.id)}
            onMoveUp={() => onReorderSection(section.id, 'up')}
            onMoveDown={() => onReorderSection(section.id, 'down')}
            onMove={(newCategory) => onMoveSection(section.id, section.event.id, newCategory)}
          />
        ))}
      </div>
    </section>
  )
}
