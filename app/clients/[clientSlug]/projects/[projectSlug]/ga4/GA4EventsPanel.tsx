'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface GA4EventsResult {
  undocumented: string[]
  documented: string[]
  total: number
}

interface Props {
  eventsUrl: string
  eventsBase: string
}

export default function GA4EventsPanel({ eventsUrl, eventsBase }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GA4EventsResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    const res = await fetch(eventsUrl)
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to fetch')
    } else {
      setResult(data)
    }
    setLoading(false)
  }

  const addDraft = async (eventName: string) => {
    const base = eventsUrl.replace(/\/ga4\/events$/, '')
    await fetch(`${base}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: eventName }),
    })
    router.refresh()
    if (result) {
      setResult({
        ...result,
        undocumented: result.undocumented.filter((n) => n !== eventName),
        documented: [...result.documented, eventName],
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">GA4 Events comparison</CardTitle>
        <CardDescription>
          Compare events firing in GA4 (last 90 days) against your documented events
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={fetch_} disabled={loading} variant="outline">
          {loading ? 'Fetching...' : 'Fetch GA4 events'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {result.total} events in GA4 — {result.documented.length} documented, {result.undocumented.length} undocumented
            </p>

            {result.undocumented.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 text-amber-600">
                  Undocumented events ({result.undocumented.length})
                </p>
                <div className="space-y-1.5">
                  {result.undocumented.map((name) => (
                    <div key={name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{name}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-6 px-2"
                        onClick={() => addDraft(name)}
                      >
                        Add as draft
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.documented.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 text-green-600">
                  Documented events ({result.documented.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.documented.map((name) => (
                    <Badge key={name} variant="outline" className="text-xs font-mono">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
