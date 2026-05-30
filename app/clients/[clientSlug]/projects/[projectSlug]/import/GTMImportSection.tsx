'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { parseGTMExport, groupEventsByName, type GTMParseResult, type GTMGroupedEvent } from '@/lib/gtmParser'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  apiBase: string
  eventsBase: string
}

interface ImportResult {
  eventsCreated: number
  eventsExisting: number
  parametersCreated: number
  parametersLinked: number
}

type Step = 'upload' | 'preview' | 'done'

// ─────────────────────────────────────────────────────────────────────────────

export default function GTMImportSection({ apiBase, eventsBase }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [parsed, setParsed] = useState<GTMParseResult | null>(null)
  const [grouped, setGrouped] = useState<GTMGroupedEvent[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [result, setResult] = useState<ImportResult | null>(null)

  // ── File reading ────────────────────────────────────────────────────────────

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string)
        const parseResult = parseGTMExport(json)
        const groups = groupEventsByName(parseResult.events)

        setParsed(parseResult)
        setGrouped(groups)
        // Select everything except variable-name events by default
        setSelected(new Set(groups.filter((g) => !g.isVariableName).map((g) => g.eventName)))
        setStep('preview')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file')
      }
    }
    reader.readAsText(file)
  }

  // ── Selection ───────────────────────────────────────────────────────────────

  const toggle = (eventName: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(eventName)) next.delete(eventName)
      else next.add(eventName)
      return next
    })
  }

  const allSelected = grouped.length > 0 && selected.size === grouped.length
  const someSelected = selected.size > 0 && !allSelected

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(grouped.map((g) => g.eventName)))
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  const runImport = async () => {
    const toImport = grouped.filter((g) => selected.has(g.eventName))
    if (toImport.length === 0) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${apiBase}/gtm/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: toImport.map((g) => ({
            eventName:  g.eventName,
            trigger:    g.triggerNames.join(', '),
            parameters: g.parameters, // [{ name, type }]
          })),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Import failed')
        return
      }

      setResult(data)
      setStep('done')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  // ── Reset ───────────────────────────────────────────────────────────────────

  const reset = () => {
    setStep('upload')
    setError(null)
    setParsed(null)
    setGrouped([])
    setSelected(new Set())
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">GTM Container JSON</CardTitle>
            <CardDescription>
              In GTM, go to <strong>Admin → Export container</strong> and download the JSON.
              The import reads all <strong>GA4 Event</strong> tags and extracts the event name,
              parameters, and trigger name.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFile}
              className="block text-sm text-muted-foreground
                file:mr-3 file:py-1.5 file:px-3 file:rounded-md
                file:border file:border-input file:text-sm file:font-medium
                file:bg-background file:text-foreground
                hover:file:bg-accent cursor-pointer"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {step === 'preview' && parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {parsed.containerName}
              {parsed.publicId && (
                <span className="ml-2 font-normal text-muted-foreground text-sm">
                  ({parsed.publicId})
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Found <strong>{grouped.length}</strong> GA4 event{grouped.length !== 1 ? 's' : ''}.
              {parsed.skippedTagCount > 0 && (
                <> {parsed.skippedTagCount} non-GA4 tag{parsed.skippedTagCount !== 1 ? 's' : ''} ignored.</>
              )}
              {' '}Select the events you want to import.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Select all */}
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={toggleAll}
                id="gtm-select-all"
              />
              <label htmlFor="gtm-select-all" className="text-xs text-muted-foreground cursor-pointer select-none">
                Select all
              </label>
            </div>

            {/* Event list */}
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {grouped.map((group) => {
                const isSelected = selected.has(group.eventName)
                return (
                  <div
                    key={group.eventName}
                    className={`border rounded-lg p-3 transition-colors cursor-pointer ${
                      isSelected ? 'bg-accent/20 border-primary/30' : 'hover:bg-accent/10'
                    }`}
                    onClick={() => toggle(group.eventName)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(group.eventName)}
                        className="mt-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        {/* Event name + badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-medium">{group.eventName}</span>
                          {group.isVariableName && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              variable name
                            </Badge>
                          )}
                          {group.tagNames.length > 1 && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              {group.tagNames.length} tags
                            </Badge>
                          )}
                        </div>

                        {/* Trigger */}
                        {group.triggerNames.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Trigger: {group.triggerNames.join(', ')}
                          </p>
                        )}

                        {/* GTM tag names (only if multiple) */}
                        {group.tagNames.length > 1 && (
                          <p className="text-xs text-muted-foreground">
                            Tags: {group.tagNames.join(', ')}
                          </p>
                        )}

                        {/* Parameters */}
                        {group.parameters.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {group.parameters.map((p) => (
                              <span
                                key={p.name}
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono bg-muted text-muted-foreground"
                              >
                                {p.name}
                                {p.type !== 'string' && (
                                  <span className="font-sans text-[10px] opacity-70">{p.type}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1">No parameters</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button
                onClick={runImport}
                disabled={loading || selected.size === 0}
              >
                {loading
                  ? 'Importing…'
                  : `Import ${selected.size} event${selected.size !== 1 ? 's' : ''}`}
              </Button>
              <Button variant="outline" onClick={reset}>
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'done' && result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-green-600">Import complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-1">
              <p>Events created: <strong>{result.eventsCreated}</strong></p>
              <p>Events already existed: <strong>{result.eventsExisting}</strong></p>
              <p>Parameters created: <strong>{result.parametersCreated}</strong></p>
              <p>Parameter links added: <strong>{result.parametersLinked}</strong></p>
            </div>
            <div className="flex gap-2">
              <Link href={eventsBase}>
                <Button>View events</Button>
              </Link>
              <Button variant="outline" onClick={reset}>
                Import another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
