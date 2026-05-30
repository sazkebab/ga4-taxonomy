'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface SyncResult {
  keyEventsAutoTicked: number
  customDimsAutoTicked: number
}

interface Props {
  syncUrl: string
}

export default function GA4SyncPanel({ syncUrl }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runSync = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    const res = await fetch(syncUrl, { method: 'POST' })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Sync failed')
    } else {
      setResult(data)
    }
    setLoading(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Auto-sync GA4 status</CardTitle>
        <CardDescription>
          Checks your GA4 property and automatically ticks checklist items for key events and
          registered custom dimensions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runSync} disabled={loading}>
          {loading ? 'Syncing...' : 'Run sync'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="text-sm space-y-1">
            <p className="text-green-600">
              Key events confirmed in GA4: <strong>{result.keyEventsAutoTicked}</strong>
            </p>
            <p className="text-green-600">
              Parameters registered in GA4: <strong>{result.customDimsAutoTicked}</strong>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
