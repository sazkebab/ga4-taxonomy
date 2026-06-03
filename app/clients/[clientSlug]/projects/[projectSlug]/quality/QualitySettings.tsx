'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Suppression { id: string; content: string; label: string; isActive: boolean; createdAt: Date }
interface Prompt      { id: string; title: string; content: string; isActive: boolean; order: number }

interface Props {
  apiBase:               string
  prompts:               Prompt[]
  suppressions:          Suppression[]
  onPromptsChange:       (prompts: Prompt[]) => void
  onSuppressionsChange:  (suppressions: Suppression[]) => void
}

export default function QualitySettings({
  apiBase, prompts, suppressions, onPromptsChange, onSuppressionsChange,
}: Props) {
  const [showPromptForm, setShowPromptForm] = useState(false)
  const [editingPrompt,  setEditingPrompt]  = useState<Prompt | null>(null)
  const [ptitle,         setPtitle]         = useState('')
  const [pcontent,       setPcontent]       = useState('')
  const [saving,         setSaving]         = useState(false)

  function startEdit(p: Prompt) {
    setEditingPrompt(p)
    setPtitle(p.title)
    setPcontent(p.content)
    setShowPromptForm(true)
  }

  function resetForm() {
    setShowPromptForm(false)
    setEditingPrompt(null)
    setPtitle('')
    setPcontent('')
  }

  async function savePrompt() {
    if (!ptitle.trim() || !pcontent.trim()) return
    setSaving(true)
    try {
      if (editingPrompt) {
        await fetch(`${apiBase}/quality/prompts/${editingPrompt.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ title: ptitle.trim(), content: pcontent.trim() }),
        })
        onPromptsChange(prompts.map((p) => p.id === editingPrompt.id ? { ...p, title: ptitle.trim(), content: pcontent.trim() } : p))
      } else {
        const res    = await fetch(`${apiBase}/quality/prompts`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ title: ptitle.trim(), content: pcontent.trim() }),
        })
        const newP = await res.json()
        onPromptsChange([...prompts, newP])
      }
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  async function deletePrompt(id: string) {
    if (!confirm('Delete this prompt?')) return
    await fetch(`${apiBase}/quality/prompts/${id}`, { method: 'DELETE' })
    onPromptsChange(prompts.filter((p) => p.id !== id))
  }

  async function togglePrompt(p: Prompt) {
    await fetch(`${apiBase}/quality/prompts/${p.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isActive: !p.isActive }),
    })
    onPromptsChange(prompts.map((x) => x.id === p.id ? { ...x, isActive: !x.isActive } : x))
  }

  async function deleteSuppression(id: string) {
    if (!confirm('Remove this suppression?')) return
    await fetch(`${apiBase}/quality/suppressions/${id}`, { method: 'DELETE' })
    onSuppressionsChange(suppressions.filter((s) => s.id !== id))
  }

  async function toggleSuppression(s: Suppression) {
    await fetch(`${apiBase}/quality/suppressions/${s.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isActive: !s.isActive }),
    })
    onSuppressionsChange(suppressions.map((x) => x.id === s.id ? { ...x, isActive: !x.isActive } : x))
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

      {/* Custom prompts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Custom prompts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Added to every monitoring report. Use to specify extra checks or focus areas.
            </p>
          </div>
          {!showPromptForm && (
            <Button size="sm" onClick={() => setShowPromptForm(true)}>+ Add</Button>
          )}
        </div>

        {showPromptForm && (
          <div className="border rounded-lg p-4 mb-4 bg-muted/10 space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={ptitle} onChange={(e) => setPtitle(e.target.value)} placeholder="e.g. Checkout conversion focus" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Prompt</Label>
              <Textarea
                value={pcontent}
                onChange={(e) => setPcontent(e.target.value)}
                rows={4}
                placeholder="e.g. Always check checkout conversion rate and flag if it drops below 2%. Compare mobile vs desktop separately."
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={savePrompt} disabled={saving || !ptitle.trim() || !pcontent.trim()}>
                {saving ? 'Saving…' : editingPrompt ? 'Update' : 'Add prompt'}
              </Button>
              <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
            </div>
          </div>
        )}

        {prompts.length === 0 && !showPromptForm ? (
          <div className="text-center py-10 text-muted-foreground text-sm border rounded-lg">
            <p>No custom prompts yet.</p>
            <p className="text-xs mt-1">Add prompts to focus monitoring on what matters most for this project.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {prompts.map((p) => (
              <div key={p.id} className={`border rounded-lg p-3 transition-opacity ${!p.isActive ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.content}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => togglePrompt(p)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${p.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-muted text-muted-foreground'}`}
                    >
                      {p.isActive ? 'On' : 'Off'}
                    </button>
                    <button onClick={() => startEdit(p)} className="text-xs text-muted-foreground hover:text-foreground px-1">Edit</button>
                    <button onClick={() => deletePrompt(p.id)} className="text-xs text-muted-foreground hover:text-destructive px-1">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suppressions */}
      <div>
        <div className="mb-4">
          <h3 className="font-semibold">Suppressions</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Findings you've marked to ignore. Future reports will skip these.
            Select text in a report and click "Ignore this" to add suppressions.
          </p>
        </div>

        {suppressions.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm border rounded-lg">
            <p>No suppressions yet.</p>
            <p className="text-xs mt-1">Select text in a report and click "Ignore this" to suppress known issues.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {suppressions.map((s) => (
              <div key={s.id} className={`border rounded-lg p-3 transition-opacity ${!s.isActive ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{s.label || s.content.slice(0, 60)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 italic">
                      "{s.content.slice(0, 100)}{s.content.length > 100 ? '…' : ''}"
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Added {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleSuppression(s)}
                      className={`text-xs px-2 py-0.5 rounded border ${s.isActive ? 'bg-muted text-muted-foreground' : 'bg-green-50 text-green-700 border-green-200'}`}
                    >
                      {s.isActive ? 'Suppress' : 'Re-enable'}
                    </button>
                    <button onClick={() => deleteSuppression(s.id)} className="text-xs text-muted-foreground hover:text-destructive px-1">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
