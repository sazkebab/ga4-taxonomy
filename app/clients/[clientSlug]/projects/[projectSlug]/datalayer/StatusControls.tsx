'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface Props {
  sectionId: string
  isDone: boolean
  isTested: boolean
  testResult: string | null
  sectionUrl: string
  onUpdate: (updates: { isDone?: boolean; isTested?: boolean; testResult?: string | null }) => void
}

export default function StatusControls({
  sectionId: _,
  isDone,
  isTested,
  testResult,
  sectionUrl,
  onUpdate,
}: Props) {
  const [saving, setSaving] = useState(false)

  async function patch(data: object) {
    setSaving(true)
    try {
      await fetch(sectionUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } finally {
      setSaving(false)
    }
  }

  async function toggleDone(checked: boolean) {
    onUpdate({ isDone: checked })
    await patch({ isDone: checked })
  }

  async function toggleTested(checked: boolean) {
    onUpdate({ isTested: checked })
    await patch({ isTested: checked })
  }

  async function changeTestResult(value: string) {
    const result = value === '' ? null : value
    onUpdate({ testResult: result })
    await patch({ testResult: result })
  }

  return (
    <div className="flex flex-wrap items-center gap-5 pt-1" data-print-hide>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`done-${sectionUrl}`}
          checked={isDone}
          onCheckedChange={(v) => toggleDone(v === true)}
          disabled={saving}
        />
        <Label htmlFor={`done-${sectionUrl}`} className="text-sm cursor-pointer">
          Done
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`tested-${sectionUrl}`}
          checked={isTested}
          onCheckedChange={(v) => toggleTested(v === true)}
          disabled={saving}
        />
        <Label htmlFor={`tested-${sectionUrl}`} className="text-sm cursor-pointer">
          Tested
        </Label>
      </div>

      {isTested && (
        <div className="flex items-center gap-2">
          <Label className="text-sm">Result:</Label>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={testResult ?? ''}
            onChange={(e) => changeTestResult(e.target.value)}
            disabled={saving}
          >
            <option value="">—</option>
            <option value="passed">✓ Passed</option>
            <option value="failed">✗ Failed</option>
          </select>
        </div>
      )}
    </div>
  )
}
