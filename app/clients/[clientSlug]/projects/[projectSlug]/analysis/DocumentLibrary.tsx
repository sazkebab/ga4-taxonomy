'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Document {
  id: string; title: string; sourceType: string; source: string; createdAt: Date; content: string
}

interface Props {
  apiBase:  string
  docs:     Document[]
  onAdd:    (doc: Document) => void
  onDelete: (id: string) => void
}

const SOURCE_TYPES = [
  { value: 'user_test',      label: 'User test' },
  { value: 'survey',         label: 'Survey' },
  { value: 'session_replay', label: 'Session replay' },
  { value: 'interview',      label: 'Interview' },
  { value: 'support',        label: 'Support tickets' },
  { value: 'other',          label: 'Other' },
]

export default function DocumentLibrary({ apiBase, docs, onAdd, onDelete }: Props) {
  const [showForm, setShowForm]     = useState(false)
  const [title,    setTitle]        = useState('')
  const [content,  setContent]      = useState('')
  const [type,     setType]         = useState('other')
  const [source,   setSource]       = useState('')
  const [saving,   setSaving]       = useState(false)
  const [error,    setError]        = useState<string | null>(null)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setTitle(''); setContent(''); setType('other'); setSource(''); setError(null); setShowForm(false)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))

    if (file.type === 'application/pdf') {
      // PDF: send as base64, server handles text extraction
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = reader.result as string
        const res = await fetch(`${apiBase}/analysis/documents/extract-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        })
        if (res.ok) {
          const { text } = await res.json()
          setContent(text)
        } else {
          setError('Could not extract text from PDF. Try pasting the content directly.')
        }
      }
      reader.readAsDataURL(file)
    } else {
      // Plain text / markdown
      const text = await file.text()
      setContent(text)
    }
    // Reset the input so the same file can be re-selected
    e.target.value = ''
  }

  async function save() {
    if (!title.trim() || !content.trim()) { setError('Title and content are required'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch(`${apiBase}/analysis/documents`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: title.trim(), content: content.trim(), sourceType: type, source: source.trim() }),
      })
      if (!res.ok) { setError('Failed to save document'); return }
      const doc = await res.json()
      onAdd(doc)
      reset()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this document?')) return
    await fetch(`${apiBase}/analysis/documents/${id}`, { method: 'DELETE' })
    onDelete(id)
  }

  const typeLabel = (t: string) => SOURCE_TYPES.find((s) => s.value === t)?.label ?? t

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-lg">Research library</h3>
            <p className="text-sm text-muted-foreground">
              Upload qualitative research so Claude can reference it during analysis
            </p>
          </div>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>+ Add document</Button>
          )}
        </div>

        {/* Add form */}
        {showForm && (
          <div className="border rounded-lg p-5 mb-6 bg-muted/20 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Checkout usability test — March 2025" />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {SOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Source <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Researcher name, tool used, or date" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Content</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileRef.current?.click()}>
                  📎 Upload file (.txt, .md, .pdf)
                </Button>
                <input ref={fileRef} type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" className="hidden" onChange={handleFile} />
              </div>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                placeholder="Paste research notes, survey responses, session replay observations, interview transcripts…"
                className="text-sm font-mono"
              />
              {content && (
                <p className="text-xs text-muted-foreground">{content.length.toLocaleString()} characters</p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save document'}
              </Button>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Document list */}
        {docs.length === 0 && !showForm ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-3">📚</p>
            <p className="font-medium">No research documents yet</p>
            <p className="text-sm mt-1">Add user tests, surveys, session replay notes, or any qualitative data to help Claude give richer analysis</p>
            <Button size="sm" className="mt-4" onClick={() => setShowForm(true)}>+ Add your first document</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <div key={doc.id} className="border rounded-lg bg-background overflow-hidden">
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpanded(expanded === doc.id ? null : doc.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{doc.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {typeLabel(doc.sourceType)}
                      {doc.source ? ` · ${doc.source}` : ''}
                      {' · '}
                      {new Date(doc.createdAt).toLocaleDateString()}
                      {' · '}
                      {doc.content.length.toLocaleString()} chars
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{expanded === doc.id ? '▲' : '▼'}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(doc.id) }}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors px-1"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {expanded === doc.id && (
                  <div className="border-t px-4 py-3 bg-muted/10">
                    <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap line-clamp-[20]">
                      {doc.content}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
