'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import CategoryGroup from './CategoryGroup'
import TableOfContents from './TableOfContents'
import GtmInstallSection from './GtmInstallSection'
import GoogleDocImport from './GoogleDocImport'
import type { Doc, Section } from './types'

interface Props {
  doc:         Doc | null
  apiBase:     string
  projectName: string
}

export default function DataLayerPageClient({ doc: initialDoc, apiBase, projectName }: Props) {
  const router                          = useRouter()
  const [doc, setDoc]                   = useState<Doc | null>(initialDoc)
  const [gtmId, setGtmId]               = useState(initialDoc?.gtmContainerId ?? '')
  const [generating, setGenerating]     = useState(false)
  const [exportingWord, setExportingWord]   = useState(false)
  const [exportingGdoc, setExportingGdoc]   = useState(false)
  const [error, setError]               = useState<string | null>(null)
  // pendingCategory: new category name typed but no events added yet
  const [pendingCategories, setPending] = useState<string[]>([])
  const [addCatInput, setAddCatInput]   = useState('')
  const [showAddCat, setShowAddCat]     = useState(false)

  // Derive sorted categories from doc sections + any pending
  const sectionsByCategory = groupByCategory(doc?.sections ?? [])
  const allCategories = [
    ...Array.from(sectionsByCategory.keys()).sort(),
    ...pendingCategories.filter((c) => !sectionsByCategory.has(c)),
  ]

  async function refreshDoc() {
    const res = await fetch(`${apiBase}/datalayer`)
    if (res.ok) {
      const d = await res.json()
      setDoc(d)
      return d as Doc | null
    }
    return null
  }

  async function generateAll() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/datalayer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all' }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Generation failed')
        return
      }
      router.refresh()
      await refreshDoc()
    } finally {
      setGenerating(false)
    }
  }

  async function generateEvent(eventId: string): Promise<Doc | null> {
    const res = await fetch(`${apiBase}/datalayer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'event', eventId }),
    })
    if (!res.ok) return null
    router.refresh()
    return refreshDoc()
  }

  function handleSectionUpdate(sectionId: string, updates: Partial<Section>) {
    setDoc((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, ...updates } : s
        ),
      }
    })
  }

  function handleSectionDelete(sectionId: string) {
    setDoc((prev) => {
      if (!prev) return prev
      return { ...prev, sections: prev.sections.filter((s) => s.id !== sectionId) }
    })
  }

  function handleReorderSection(sectionId: string, direction: 'up' | 'down', category: string) {
    // Find the sorted sections for this category
    const catSections = (sectionsByCategory.get(category) ?? [])
    const idx = catSections.findIndex((s) => s.id === sectionId)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= catSections.length) return

    const s1 = catSections[idx]
    const s2 = catSections[swapIdx]
    const newOrder1 = s2.order
    const newOrder2 = s1.order

    // Update local state immediately (optimistic)
    setDoc((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.id === s1.id) return { ...s, order: newOrder1 }
          if (s.id === s2.id) return { ...s, order: newOrder2 }
          return s
        }),
      }
    })

    // Persist both
    Promise.all([
      fetch(`${apiBase}/datalayer/sections/${s1.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder1 }),
      }),
      fetch(`${apiBase}/datalayer/sections/${s2.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder2 }),
      }),
    ])
  }

  async function handleRename(from: string, to: string) {
    const res = await fetch(`${apiBase}/datalayer/rename-category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    })
    if (!res.ok) return
    // Update all sections in local state whose event.category === from
    setDoc((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          (s.event.category ?? '') === from
            ? { ...s, event: { ...s.event, category: to } }
            : s
        ),
      }
    })
    // Update any pending category entries
    setPending((p) => p.map((c) => (c === from ? to : c)))
  }

  async function handleMoveSection(sectionId: string, eventId: string, newCategory: string) {
    // PUT the event's category
    const res = await fetch(`${apiBase}/events/${eventId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newCategory }),
    })
    if (!res.ok) return
    // Update local state: move the section to the new category
    setDoc((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId
            ? { ...s, event: { ...s.event, category: newCategory } }
            : s
        ),
      }
    })
  }

  function addPendingCategory() {
    const cat = addCatInput.trim().toLowerCase()
    if (!cat) return
    if (!pendingCategories.includes(cat) && !sectionsByCategory.has(cat)) {
      setPending((p) => [...p, cat])
    }
    setAddCatInput('')
    setShowAddCat(false)
  }

  async function handleWordExport() {
    setExportingWord(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/datalayer/export/docx`)
      if (!res.ok) { setError('Word export failed'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${projectName.replace(/[^a-z0-9]/gi, '_')}_datalayer.docx`
      a.click()
      URL.revokeObjectURL(url)
    } finally { setExportingWord(false) }
  }

  async function handleGdocExport() {
    setExportingGdoc(true)
    setError(null)
    try {
      const res  = await fetch(`${apiBase}/datalayer/export/googledoc`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Google Doc export failed'); return }
      window.open(data.url, '_blank')
    } finally { setExportingGdoc(false) }
  }

  const hasContent = (doc?.sections.length ?? 0) > 0 || pendingCategories.length > 0

  return (
    <div>
      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-6" data-print-hide>
        {hasContent ? (
          <Button onClick={generateAll} disabled={generating} variant="outline" size="sm">
            {generating ? 'Regenerating…' : '↺ Regenerate all'}
          </Button>
        ) : (
          <Button onClick={generateAll} disabled={generating} size="sm">
            {generating ? 'Generating…' : 'Generate documentation'}
          </Button>
        )}

        {/* Add category */}
        {showAddCat ? (
          <div className="flex items-center gap-1">
            <input
              className="h-8 rounded-md border border-input bg-background px-3 text-sm w-36"
              placeholder="Category name…"
              value={addCatInput}
              onChange={(e) => setAddCatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addPendingCategory() }}
              autoFocus
            />
            <Button size="sm" variant="outline" className="h-8" onClick={addPendingCategory}>Add</Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowAddCat(false); setAddCatInput('') }}>✕</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowAddCat(true)} disabled={generating}>
            + Add category
          </Button>
        )}

        <div className="ml-auto flex gap-2">
          <GoogleDocImport apiBase={apiBase} />
          <Button variant="outline" size="sm" onClick={handleWordExport} disabled={exportingWord || !hasContent}>
            {exportingWord ? 'Exporting…' : '⬇ Word'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleGdocExport} disabled={exportingGdoc || !hasContent}>
            {exportingGdoc ? 'Creating…' : '📝 Google Doc'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            🖨 Print
          </Button>
        </div>
      </div>

      {!hasContent && (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-16 text-center" data-print-hide>
          <p className="text-4xl mb-4">📄</p>
          <h3 className="text-lg font-semibold mb-2">No documentation yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">
            Generate structured dataLayer documentation for all events that require a push,
            or add a category manually to start building from scratch.
          </p>
        </div>
      )}

      {/* GTM install section — always shown */}
      <GtmInstallSection
        docId={doc?.id ?? null}
        initialId={gtmId}
        apiBase={apiBase}
        onSaved={setGtmId}
      />

      {hasContent && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_220px] gap-8">
          {/* Main content — self-start so the column only grows with content */}
          <div className="space-y-12 min-w-0 self-start">
            {allCategories.map((cat) => (
              <CategoryGroup
                key={cat}
                category={cat}
                sections={sectionsByCategory.get(cat) ?? []}
                apiBase={apiBase}
                allCategories={allCategories}
                onSectionUpdate={handleSectionUpdate}
                onSectionDelete={handleSectionDelete}
                onEventAdded={async (eventId, removePending) => {
                  const newDoc = await generateEvent(eventId)
                  if (newDoc && removePending) {
                    setPending((p) => p.filter((c) => c !== cat))
                  }
                }}
                onCopyEcommerce={async (sourceSectionId) => {
                  const res = await fetch(`${apiBase}/datalayer/copy-ecommerce`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sourceSectionId }),
                  })
                  if (res.ok) {
                    const data = await res.json()
                    await refreshDoc()
                    return data.updated as number
                  }
                  return 0
                }}
                onRename={handleRename}
                onMoveSection={handleMoveSection}
                onReorderSection={(sectionId, direction) => handleReorderSection(sectionId, direction, cat)}
              />
            ))}
          </div>

          {/* TOC */}
          <TableOfContents
            categories={allCategories}
            sectionsByCategory={sectionsByCategory}
          />
        </div>
      )}
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function groupByCategory(sections: Section[]): Map<string, Section[]> {
  const map = new Map<string, Section[]>()
  for (const s of sections) {
    const cat = s.event.category || '(uncategorised)'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(s)
  }
  // Sort within each category by the section's order value
  for (const [, secs] of map) {
    secs.sort((a, b) => a.order - b.order)
  }
  return map
}
