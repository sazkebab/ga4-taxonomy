'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  currentPropertyId: string
  currentPropertyName?: string | null
  propertyUrl: string
}

export default function GA4PropertyForm({ currentPropertyId, currentPropertyName, propertyUrl }: Props) {
  const router = useRouter()
  const [value, setValue] = useState(currentPropertyId)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setSaving(true)
    await fetch(propertyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: value }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 123456789"
          className="max-w-xs"
        />
        <Button onClick={save} disabled={saving || !value.trim()} size="sm">
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
        </Button>
      </div>
      {currentPropertyName && (
        <p className="text-sm text-muted-foreground">
          Connected to: <span className="font-medium text-foreground">{currentPropertyName}</span>
        </p>
      )}
    </div>
  )
}
