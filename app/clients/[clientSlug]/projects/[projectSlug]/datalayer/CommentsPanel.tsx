'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Comment {
  id: string
  sectionId: string
  body: string
  createdAt: string
}

interface Props {
  sectionId: string
  comments: Comment[]
  commentsUrl: string
  onUpdate: (comments: Comment[]) => void
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

export default function CommentsPanel({ sectionId: _, comments, commentsUrl, onUpdate }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')

  async function addComment() {
    if (!body.trim()) return
    setSaving(true)
    try {
      const res = await fetch(commentsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (res.ok) {
        const comment = await res.json()
        onUpdate([...comments, comment])
        setBody('')
        setShowForm(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(commentId: string) {
    if (!editBody.trim()) return
    const res = await fetch(`${commentsUrl}/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: editBody }),
    })
    if (res.ok) {
      const updated = await res.json()
      onUpdate(comments.map((c) => (c.id === commentId ? updated : c)))
      setEditId(null)
    }
  }

  async function deleteComment(commentId: string) {
    const res = await fetch(`${commentsUrl}/${commentId}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      onUpdate(comments.filter((c) => c.id !== commentId))
    }
  }

  return (
    <div data-print-hide>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Comments {comments.length > 0 && `(${comments.length})`}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2"
          onClick={() => setShowForm(!showForm)}
        >
          + Add comment
        </Button>
      </div>

      {/* Comment list */}
      {comments.length > 0 && (
        <div className="space-y-2 mb-3">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-md bg-muted/40 px-3 py-2">
              {editId === comment.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={2}
                    className="text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(comment.id)}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setEditId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1">{comment.body}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(comment.createdAt)}
                    </span>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground ml-1 px-1"
                      onClick={() => { setEditId(comment.id); setEditBody(comment.body) }}
                    >
                      Edit
                    </button>
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive px-1"
                      onClick={() => deleteComment(comment.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add comment form */}
      {showForm && (
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            className="text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={addComment} disabled={saving || !body.trim()}>
              {saving ? 'Saving…' : 'Add'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => { setShowForm(false); setBody('') }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
