'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import ParameterList from '@/components/ParameterList'

interface Event {
  id: string
  name: string
  category: string
  trigger: string
  notes: string
  requiresDataLayer: boolean
  isKeyEvent: boolean
  checkDocumented: boolean
  checkDataLayerDoc: boolean
  checkGtmSetUp: boolean
  checkGtmPasses: boolean
  checkGa4KeyEvent: boolean
}

interface Parameter {
  id: string
  name: string
  description: string
  type: string
  isGlobal: boolean
  isGlobalAttached: boolean
  requiresGA4Registration: boolean
  ga4Registered: boolean
}

interface AvailableParameter {
  id: string
  name: string
  type: string
  isGlobal: boolean
}

interface Props {
  event: Event
  apiBase: string
  eventsBase: string
  parameters?: Parameter[]
  allParameters?: AvailableParameter[]
  categories?: string[]
  showParameters?: boolean
  showDelete?: boolean
}

export default function EventDetailClient({
  event,
  apiBase,
  eventsBase,
  parameters = [],
  allParameters = [],
  categories = [],
  showParameters = false,
  showDelete = false,
}: Props) {
  const router = useRouter()
  const [name, setName] = useState(event.name)
  const [category, setCategory] = useState(event.category)
  const [trigger, setTrigger] = useState(event.trigger)
  const [notes, setNotes] = useState(event.notes)
  const [requiresDataLayer, setRequiresDataLayer] = useState(event.requiresDataLayer)
  const [isKeyEvent, setIsKeyEvent] = useState(event.isKeyEvent)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${apiBase}/events/${event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, trigger, notes, requiresDataLayer, isKeyEvent }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveError(data.error?.formErrors?.[0] ?? data.error ?? `Save failed (${res.status})`)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    } catch {
      setSaveError('Network error — could not reach the server')
    } finally {
      setSaving(false)
    }
  }

  const deleteEvent = async () => {
    if (!confirm(`Delete event "${event.name}"? This cannot be undone.`)) return
    await fetch(`${apiBase}/events/${event.id}`, { method: 'DELETE' })
    router.push(eventsBase)
  }

  if (showDelete) {
    return (
      <Button variant="destructive" size="sm" onClick={deleteEvent}>
        Delete event
      </Button>
    )
  }

  if (showParameters) {
    return (
      <ParameterList
        eventId={event.id}
        apiBase={apiBase}
        parameters={parameters}
        allParameters={allParameters}
        onUpdate={() => router.refresh()}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Event name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Category</Label>
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. ecommerce, search, form"
          list="edit-event-categories"
        />
        {categories.length > 0 && (
          <datalist id="edit-event-categories">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        )}
        <p className="text-xs text-muted-foreground">
          Used for event naming: custom.{'{category}'}.{'{name}'}
        </p>
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

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Internal notes, context, or implementation reminders..."
        />
      </div>

      <div className="flex items-center gap-3">
        <Checkbox
          id="edit-requiresDataLayer"
          checked={requiresDataLayer}
          onCheckedChange={(v) => setRequiresDataLayer(Boolean(v))}
        />
        <Label htmlFor="edit-requiresDataLayer" className="cursor-pointer">
          Requires dataLayer push
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Checkbox
          id="edit-isKeyEvent"
          checked={isKeyEvent}
          onCheckedChange={(v) => setIsKeyEvent(Boolean(v))}
        />
        <Label htmlFor="edit-isKeyEvent" className="cursor-pointer">
          Mark as key event
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save changes'}
        </Button>
        {saveError && (
          <p className="text-sm text-destructive">{saveError}</p>
        )}
      </div>
    </div>
  )
}
