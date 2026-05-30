'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  clientId: string
  projectId: string
  base: string        // slug-based: /clients/[clientSlug]/projects/[projectSlug]
  apiBase: string     // id-based:   /api/clients/[clientId]/projects/[projectId]
  categories: string[]
}

export default function NewEventForm({ clientId, projectId, base, apiBase, categories }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [trigger, setTrigger] = useState('')
  const [requiresDataLayer, setRequiresDataLayer] = useState(false)
  const [isKeyEvent, setIsKeyEvent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Suppress unused-variable warnings — kept for potential future use
  void clientId
  void projectId

  const save = async () => {
    if (!name.trim()) { setError('Event name is required'); return }
    setSaving(true)
    setError(null)

    const res = await fetch(`${apiBase}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), category: category.trim(), trigger, requiresDataLayer, isKeyEvent }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error?.formErrors?.[0] ?? 'Failed to create')
      setSaving(false)
      return
    }

    const event = await res.json()
    router.push(`${base}/events/${event.id}`)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href={`${base}/events`} className="text-sm text-muted-foreground hover:underline">
          ← Events
        </Link>
        <h2 className="text-2xl font-semibold mt-2">New event</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Event name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. purchase"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. ecommerce, search, form"
              list="new-event-categories"
            />
            {categories.length > 0 && (
              <datalist id="new-event-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            )}
            <p className="text-xs text-muted-foreground">Used for grouping and event naming: custom.{'{category}'}.{'{name}'}</p>
          </div>

          <div className="space-y-1.5">
            <Label>Trigger</Label>
            <Textarea
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              rows={3}
              placeholder="Describe when this event fires..."
            />
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="requiresDataLayer"
              checked={requiresDataLayer}
              onCheckedChange={(v) => setRequiresDataLayer(Boolean(v))}
            />
            <Label htmlFor="requiresDataLayer" className="cursor-pointer">
              Requires dataLayer push
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="isKeyEvent"
              checked={isKeyEvent}
              onCheckedChange={(v) => setIsKeyEvent(Boolean(v))}
            />
            <Label htmlFor="isKeyEvent" className="cursor-pointer">
              Mark as key event
            </Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Creating...' : 'Create event'}
            </Button>
            <Link href={`${base}/events`}>
              <Button variant="outline">Cancel</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
