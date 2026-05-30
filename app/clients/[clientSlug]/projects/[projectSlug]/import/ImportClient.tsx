'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import GTMImportSection from './GTMImportSection'

type Step = 'url' | 'preview' | 'done'

interface PreviewData {
  rows: string[][]
  totalRows: number
}

interface ImportResult {
  eventsCreated: number
  eventsSkipped: number
  parametersCreated: number
}

interface Props {
  clientId: string
  projectId: string
  base: string
  apiBase: string
}

export default function ImportClient({ base, apiBase }: Props) {
  const apiUrl = `${apiBase}/sheets/import`

  const [step, setStep] = useState<Step>('url')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Preview
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [headerRow, setHeaderRow] = useState(0)
  const [eventNameCol, setEventNameCol] = useState<number | null>(null)
  const [triggerCol, setTriggerCol] = useState<number | null>(null)
  const [paramCols, setParamCols] = useState<number[]>([])

  // Result
  const [result, setResult] = useState<ImportResult | null>(null)

  const fetchPreview = async () => {
    if (!url.trim()) { setError('Please enter a URL'); return }
    setLoading(true)
    setError(null)

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'preview', url }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error?.formErrors?.[0] ?? data.error ?? 'Failed to fetch sheet')
      setLoading(false)
      return
    }
    setPreview(data)
    setStep('preview')
    setLoading(false)
  }

  const runImport = async () => {
    setLoading(true)
    setError(null)

    const parameterCols: number[] = paramCols
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'import',
        url,
        headerRow,
        mappings: {
          eventName: eventNameCol ?? undefined,
          trigger: triggerCol ?? undefined,
          parameters: parameterCols.length > 0 ? parameterCols : undefined,
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error?.formErrors?.[0] ?? data.error ?? 'Import failed')
      setLoading(false)
      return
    }
    setResult(data)
    setStep('done')
    setLoading(false)
  }

  const headerRowData = preview?.rows[headerRow] ?? []
  const maxCols = Math.max(...(preview?.rows.map((r) => r.length) ?? [0]))
  const colOptions = Array.from({ length: maxCols }, (_, i) => ({
    value: String(i),
    label: `Col ${i + 1}${headerRowData[i] ? ` — ${headerRowData[i]}` : ''}`,
  }))

  const toggleParamCol = (col: number) => {
    setParamCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-2">
        <Link href={`${base}/events`} className="text-sm text-muted-foreground hover:underline">
          ← Events
        </Link>
      </div>

      <div className="mb-6 mt-2">
        <h2 className="text-2xl font-semibold">Import</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Import events and parameters from a Google Sheet or GTM container
        </p>
      </div>

      <h3 className="text-base font-semibold mb-3">From GTM container</h3>
      <GTMImportSection apiBase={apiBase} eventsBase={`${base}/events`} />

      <h3 className="text-base font-semibold mt-8 mb-3">From Google Sheets</h3>

      {step === 'url' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sheet URL</CardTitle>
            <CardDescription>Paste the Google Sheets URL (must be publicly viewable)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={fetchPreview} disabled={loading}>
              {loading ? 'Fetching...' : 'Preview sheet'}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sheet preview</CardTitle>
              <CardDescription>{preview.totalRows} rows found</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full">
                  <tbody>
                    {preview.rows.map((row, ri) => (
                      <tr key={ri} className={ri === headerRow ? 'bg-primary/10' : ''}>
                        <td className="border px-2 py-1 text-muted-foreground font-medium w-6">{ri}</td>
                        {row.map((cell, ci) => (
                          <td key={ci} className="border px-2 py-1 max-w-[120px] truncate">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Column mapping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Header row (0-indexed)</Label>
                <Input
                  type="number"
                  min={0}
                  value={headerRow}
                  onChange={(e) => setHeaderRow(Number(e.target.value))}
                  className="w-20"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Event name column</Label>
                <Select
                  value={eventNameCol !== null ? String(eventNameCol) : ''}
                  onValueChange={(v) => setEventNameCol(v ? Number(v) : null)}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select column..." />
                  </SelectTrigger>
                  <SelectContent>
                    {colOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Trigger column (optional)</Label>
                <Select
                  value={triggerCol !== null ? String(triggerCol) : ''}
                  onValueChange={(v) => setTriggerCol(v ? Number(v) : null)}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {colOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Parameter columns (select all that apply)</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {colOptions.map((o) => {
                    const col = Number(o.value)
                    const selected = paramCols.includes(col)
                    return (
                      <button
                        key={o.value}
                        onClick={() => toggleParamCol(col)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          selected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-accent border-border'
                        }`}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
                {paramCols.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1">
                    {paramCols.map((c) => (
                      <Badge key={c} variant="secondary" className="text-xs">
                        {colOptions[c]?.label ?? `Col ${c}`}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2">
                <Button
                  onClick={runImport}
                  disabled={loading || eventNameCol === null}
                >
                  {loading ? 'Importing...' : 'Import'}
                </Button>
                <Button variant="outline" onClick={() => setStep('url')}>
                  Back
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 'done' && result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-green-600">Import complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-1">
              <p>Events created: <strong>{result.eventsCreated}</strong></p>
              <p>Events skipped (already exist): <strong>{result.eventsSkipped}</strong></p>
              <p>Parameters created: <strong>{result.parametersCreated}</strong></p>
            </div>
            <div className="flex gap-2">
              <Link href={`${base}/events`}>
                <Button>View events</Button>
              </Link>
              <Button variant="outline" onClick={() => { setStep('url'); setUrl(''); setPreview(null); setResult(null) }}>
                Import another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
