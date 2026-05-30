'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface ChecklistPanelProps {
  checklistUrl: string
  isKeyEvent: boolean
  requiresDataLayer: boolean
  initial: {
    checkDocumented: boolean
    checkDataLayerDoc: boolean
    checkGtmSetUp: boolean
    checkGtmPasses: boolean
    checkGa4KeyEvent: boolean
  }
}

// Steps in implementation order.
// dataLayerOnly = hidden when event doesn't require a dataLayer push.
// keyEventOnly  = hidden when event is not a key event.
const ITEMS = [
  { key: 'checkDataLayerDoc', label: 'dataLayer document done', dataLayerOnly: true },
  { key: 'checkDocumented',   label: 'dataLayer implemented',   dataLayerOnly: true },
  { key: 'checkGtmSetUp',     label: 'GTM work done' },
  { key: 'checkGtmPasses',    label: 'Work passed' },
  { key: 'checkGa4KeyEvent',  label: 'Key event set up in GA4', keyEventOnly: true },
] as const

type ChecklistKey = (typeof ITEMS)[number]['key']

export default function ChecklistPanel({
  checklistUrl,
  isKeyEvent,
  requiresDataLayer,
  initial,
}: ChecklistPanelProps) {
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState<string | null>(null)

  const toggle = async (field: ChecklistKey, value: boolean) => {
    setSaving(field)
    setValues((prev) => ({ ...prev, [field]: value }))
    await fetch(checklistUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    })
    setSaving(null)
  }

  const visibleItems = ITEMS.filter((item) => {
    if ('dataLayerOnly' in item && item.dataLayerOnly && !requiresDataLayer) return false
    if ('keyEventOnly' in item && item.keyEventOnly && !isKeyEvent) return false
    return true
  })

  return (
    <div className="space-y-3">
      {visibleItems.map((item) => {
        const checked = values[item.key]
        return (
          <div key={item.key} className="flex items-center gap-3">
            <Checkbox
              id={item.key}
              checked={checked}
              disabled={saving === item.key}
              onCheckedChange={(val) => toggle(item.key, Boolean(val))}
            />
            <Label
              htmlFor={item.key}
              className={`text-sm cursor-pointer ${checked ? 'line-through text-muted-foreground' : ''}`}
            >
              {item.label}
            </Label>
          </div>
        )
      })}
    </div>
  )
}
