'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Hypothesis { question: string; hypothesis: string }

interface Analysis {
  id:                  string
  coreQuestion:        string
  useCase:             string
  stakeholderName:     string
  stakeholderLiteracy: string
  keyKpis:             string[]
  insightDestination:  string
  preferredOutputStyle:string
  priorKnowledge:      string
  subQuestions:        string[]
  hypotheses:          Hypothesis[]
  status:              string
  reportMarkdown:      string
  progressLog?:        string
}

interface Props {
  analysis:     Analysis
  apiBase:      string
  onComplete:   (report: string) => void
  onStatusChange:(status: string) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const USE_CASES = [
  { value: 'inform_ux_design',    label: 'Inform UX design',    desc: 'Design problems & solutions with UI recommendations' },
  { value: 'run_experiments',     label: 'Run experiments',     desc: 'A/B test hypotheses with metrics & sample sizes' },
  { value: 'change_campaigns',    label: 'Change campaigns',    desc: 'Acquisition channel & audience behaviour insights' },
  { value: 'email_customers',     label: 'Email customers',     desc: 'Customer segments & trigger point recommendations' },
  { value: 'build_business_case', label: 'Build a business case', desc: 'Revenue impact quantified, effort/impact ratio' },
]

const LITERACY_LEVELS = [
  { value: 'low',    label: 'Low',    desc: 'Plain English, no jargon' },
  { value: 'medium', label: 'Medium', desc: 'Standard analytics terms' },
  { value: 'high',   label: 'High',   desc: 'Technical, raw numbers, methodology' },
]

const TOOL_LABELS: Record<string, string> = {
  run_ga4_report:       'Running GA4 report',
  get_funnel_data:      'Analysing funnel',
  get_page_performance: 'Checking page performance',
  get_top_events:       'Getting top events',
  get_conversion_trend: 'Getting conversion trends',
  search_documents:     'Searching research documents',
}

// Progress is persisted server-side as a JSON array of completed tool calls
// so a polling client can show progress without a live SSE connection.
function parseProgressLog(raw: string | undefined): { name: string; summary?: string }[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

const POLL_INTERVAL_MS = 3000

// ─── Component ────────────────────────────────────────────────────────────────

export default function GuidedAnalysisWizard({ analysis: initial, apiBase, onComplete, onStatusChange }: Props) {
  // useCase is stored as a JSON array string e.g. '["inform_ux_design","run_experiments"]'
  // Parse it, falling back to wrapping a legacy single string value
  function parseUseCases(raw: string): string[] {
    if (!raw) return []
    try { return JSON.parse(raw) } catch { return raw ? [raw] : [] }
  }

  const [data,         setData]         = useState<Analysis>({ ...initial, useCase: initial.useCase })
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>(() => parseUseCases(initial.useCase))
  const [step,         setStep]         = useState(initial.status === 'complete' ? 7 : initial.status === 'error' ? 6 : 1)
  const [saving,       setSaving]       = useState(false)
  const [suggesting,   setSuggesting]   = useState(false)
  const [suggestErr,   setSuggestErr]   = useState<string | null>(null)
  const [runError,     setRunError]     = useState<string | null>(null)
  const [kpiInput,     setKpiInput]     = useState('')

  const save = useCallback(async (patch: Partial<Analysis>) => {
    setSaving(true)
    const body: Record<string, unknown> = { ...patch }
    // Convert arrays to proper types for API
    await fetch(`${apiBase}/analysis/guided/${data.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    setData((prev) => ({ ...prev, ...patch }))
    setSaving(false)
  }, [apiBase, data.id])

  async function suggestQuestions() {
    setSuggesting(true)
    setSuggestErr(null)
    try {
      const res  = await fetch(`${apiBase}/analysis/guided/${data.id}/suggest-questions`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setSuggestErr(json?.error ?? `Request failed (${res.status})`)
        return
      }
      setData((prev) => ({ ...prev, subQuestions: json?.subQuestions ?? [] }))
    } catch {
      setSuggestErr('Network error — could not reach the server')
    } finally {
      setSuggesting(false)
    }
  }

  async function runAnalysis() {
    setRunError(null)
    setData((prev) => ({ ...prev, status: 'running', reportMarkdown: '', progressLog: '[]' }))
    onStatusChange('running')

    try {
      const res  = await fetch(`${apiBase}/analysis/guided/${data.id}/run`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setRunError(json?.error ?? `Request failed (${res.status})`)
        setData((prev) => ({ ...prev, status: 'error' }))
        onStatusChange('error')
        return
      }
    } catch {
      setRunError('Network error — could not reach the server')
      setData((prev) => ({ ...prev, status: 'error' }))
      onStatusChange('error')
      return
    }
    // Started successfully — the polling effect below picks up progress and
    // final status, including if the page is closed and reopened later.
  }

  // Poll for progress/completion while the analysis is running in the
  // background. This covers both "I just started it" and "I reopened this
  // page while it was already running".
  useEffect(() => {
    if (data.status !== 'running') return
    let cancelled = false

    async function tick() {
      try {
        const res = await fetch(`${apiBase}/analysis/guided/${data.id}`)
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (cancelled) return
        setData((prev) => ({
          ...prev,
          status:         json.status,
          reportMarkdown: json.reportMarkdown ?? prev.reportMarkdown,
          progressLog:    json.progressLog ?? prev.progressLog,
        }))
        if (json.status === 'complete') {
          onStatusChange('complete')
          onComplete(json.reportMarkdown)
          setStep(7)
        } else if (json.status === 'error') {
          onStatusChange('error')
          setStep(6)
        }
      } catch { /* network blip — try again next tick */ }
    }

    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.status, data.id, apiBase])

  // ── Step navigation ──────────────────────────────────────────────────────

  const canAdvance = (() => {
    if (step === 1) return !!data.coreQuestion.trim()
    if (step === 2) return selectedUseCases.length > 0
    return true
  })()

  // Carry Step 5's sub-questions over as Step 6's "Question" fields, preserving
  // any assumed-answers already entered for questions that still match.
  function syncHypothesesFromSubQuestions() {
    const questions = data.subQuestions.map((q) => q.trim()).filter(Boolean)
    if (questions.length === 0) return
    const existing = new Map(data.hypotheses.map((h) => [h.question.trim(), h.hypothesis]))
    const updated = questions.map((q) => ({ question: q, hypothesis: existing.get(q) ?? '' }))
    setData((p) => ({ ...p, hypotheses: updated }))
    save({ hypotheses: updated })
  }

  function next() {
    if (!canAdvance) return
    if (step === 5) syncHypothesesFromSubQuestions()
    setStep((s) => s + 1)
  }
  function back() { setStep((s) => s - 1) }

  // ── Render ───────────────────────────────────────────────────────────────

  if (data.status === 'running') {
    const toolsDone = parseProgressLog(data.progressLog)
    return (
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <h3 className="font-semibold text-lg mb-1">Running analysis…</h3>
        <p className="text-xs text-muted-foreground mb-4">
          This runs in the background — feel free to close this tab or navigate away. Come back here anytime to see progress.
        </p>
        <div className="space-y-2 mb-6">
          {toolsDone.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-green-600">✓</span>
              {TOOL_LABELS[t.name] ?? t.name}
            </div>
          ))}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="animate-pulse">⚡</span>
            Working…
          </div>
        </div>
        {data.reportMarkdown && (
          <div className="border rounded-lg p-4 bg-muted/20 text-sm whitespace-pre-wrap leading-relaxed">
            {data.reportMarkdown}
          </div>
        )}
      </div>
    )
  }

  if (data.status === 'error') {
    return (
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg text-destructive">Analysis failed</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setData((p) => ({ ...p, status: 'draft' })); setRunError(null); setStep(6) }}
          >
            ← Back to edit
          </Button>
        </div>
        <div className="border border-destructive/30 rounded-lg p-4 bg-destructive/5 text-sm whitespace-pre-wrap leading-relaxed mb-4">
          {runError || data.reportMarkdown || 'An unknown error occurred.'}
        </div>
        <Button
          onClick={() => { setData((p) => ({ ...p, status: 'draft' })); setRunError(null); runAnalysis() }}
        >
          Try again
        </Button>
      </div>
    )
  }

  if (step === 7 || data.status === 'complete') {
    return (
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Analysis report</h3>
          <Button variant="outline" size="sm" onClick={() => setStep(6)}>← Edit</Button>
        </div>
        <div className="border rounded-lg p-6 bg-background text-sm whitespace-pre-wrap leading-relaxed">
          {data.reportMarkdown}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
      {/* Progress */}
      <div className="flex items-center gap-1.5 mb-8">
        {[1,2,3,4,5,6].map((s) => (
          <div
            key={s}
            className={['h-1.5 flex-1 rounded-full transition-colors', s <= step ? 'bg-primary' : 'bg-muted'].join(' ')}
          />
        ))}
      </div>

      {/* Step 1: Core question */}
      {step === 1 && (
        <WizardStep title="What do you want to understand?" subtitle="Step 1 of 6 — Core question">
          <Textarea
            value={data.coreQuestion}
            onChange={(e) => setData((p) => ({ ...p, coreQuestion: e.target.value }))}
            onBlur={() => save({ coreQuestion: data.coreQuestion })}
            rows={4}
            placeholder="e.g. Why are mobile users converting at half the rate of desktop users on the checkout page?"
            autoFocus
          />
        </WizardStep>
      )}

      {/* Step 2: Use case (multi-select) */}
      {step === 2 && (
        <WizardStep title="What will you do with this insight?" subtitle="Step 2 of 6 — Use case">
          <p className="text-sm text-muted-foreground mb-3">Select all that apply — the report will address each.</p>
          <div className="grid gap-2">
            {USE_CASES.map((uc) => {
              const selected = selectedUseCases.includes(uc.value)
              return (
                <button
                  key={uc.value}
                  onClick={() => {
                    const next = selected
                      ? selectedUseCases.filter((v) => v !== uc.value)
                      : [...selectedUseCases, uc.value]
                    setSelectedUseCases(next)
                    const encoded = JSON.stringify(next)
                    setData((p) => ({ ...p, useCase: encoded }))
                    save({ useCase: encoded })
                  }}
                  className={[
                    'text-left border rounded-lg px-4 py-3 transition-colors flex items-start gap-3',
                    selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                  ].join(' ')}
                >
                  <span className={`mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center text-xs font-bold ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                    {selected ? '✓' : ''}
                  </span>
                  <div>
                    <p className="font-medium text-sm">{uc.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{uc.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
          {selectedUseCases.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              {selectedUseCases.length} selected — report will be framed for all of these
            </p>
          )}
        </WizardStep>
      )}

      {/* Step 3: Stakeholder context */}
      {step === 3 && (
        <WizardStep title="Who is this for?" subtitle="Step 3 of 6 — Stakeholder context">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Stakeholder name <Opt /></Label>
              <Input value={data.stakeholderName} onChange={(e) => setData((p) => ({ ...p, stakeholderName: e.target.value }))} onBlur={() => save({ stakeholderName: data.stakeholderName })} placeholder="e.g. Head of ecommerce" />
            </div>
            <div className="space-y-1.5">
              <Label>Data literacy</Label>
              <div className="grid grid-cols-3 gap-2">
                {LITERACY_LEVELS.map((l) => (
                  <button key={l.value} onClick={() => { setData((p) => ({ ...p, stakeholderLiteracy: l.value })); save({ stakeholderLiteracy: l.value }) }}
                    className={['border rounded-lg px-3 py-2.5 text-left transition-colors', data.stakeholderLiteracy === l.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'].join(' ')}>
                    <p className="text-sm font-medium">{l.label}</p>
                    <p className="text-xs text-muted-foreground">{l.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Key KPIs <Opt /></Label>
              <div className="flex gap-2">
                <Input value={kpiInput} onChange={(e) => setKpiInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && kpiInput.trim()) { const updated = [...data.keyKpis, kpiInput.trim()]; setData((p) => ({ ...p, keyKpis: updated })); save({ keyKpis: updated }); setKpiInput('') } }}
                  placeholder="Type a KPI and press Enter" />
              </div>
              {data.keyKpis.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {data.keyKpis.map((k, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5">
                      {k}
                      <button onClick={() => { const updated = data.keyKpis.filter((_, j) => j !== i); setData((p) => ({ ...p, keyKpis: updated })); save({ keyKpis: updated }) }} className="text-muted-foreground hover:text-destructive">✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Where will this insight go? <Opt /></Label>
              <Input value={data.insightDestination} onChange={(e) => setData((p) => ({ ...p, insightDestination: e.target.value }))} onBlur={() => save({ insightDestination: data.insightDestination })} placeholder="e.g. Board deck, sprint planning, marketing brief" />
            </div>
            <div className="space-y-1.5">
              <Label>How do they like information presented? <Opt /></Label>
              <Input value={data.preferredOutputStyle} onChange={(e) => setData((p) => ({ ...p, preferredOutputStyle: e.target.value }))} onBlur={() => save({ preferredOutputStyle: data.preferredOutputStyle })} placeholder="e.g. They love visuals, short bullets, executive summary first" />
            </div>
          </div>
        </WizardStep>
      )}

      {/* Step 4: Prior knowledge */}
      {step === 4 && (
        <WizardStep title="What do you already know?" subtitle="Step 4 of 6 — Prior knowledge">
          <Textarea
            value={data.priorKnowledge}
            onChange={(e) => setData((p) => ({ ...p, priorKnowledge: e.target.value }))}
            onBlur={() => save({ priorKnowledge: data.priorKnowledge })}
            rows={5}
            placeholder="e.g. We know mobile traffic is growing and our checkout was redesigned 3 months ago. We suspect the new payment form has issues on iOS."
          />
        </WizardStep>
      )}

      {/* Step 5: Sub-questions */}
      {step === 5 && (
        <WizardStep title="Break it down" subtitle="Step 5 of 6 — Sub-questions">
          <p className="text-sm text-muted-foreground mb-3">
            What specific questions need answering to address the core question?
          </p>
          <Button variant="outline" size="sm" onClick={suggestQuestions} disabled={suggesting} className="mb-2">
            {suggesting ? '✨ Generating…' : '✨ Suggest questions with AI'}
          </Button>
          {suggestErr && <p className="text-xs text-destructive mb-2">{suggestErr}</p>}
          <div className="space-y-2 mt-2">
            {data.subQuestions.map((q, i) => (
              <div key={i} className="flex gap-2">
                <Input value={q} onChange={(e) => { const updated = [...data.subQuestions]; updated[i] = e.target.value; setData((p) => ({ ...p, subQuestions: updated })) }}
                  onBlur={() => save({ subQuestions: data.subQuestions })} placeholder={`Sub-question ${i + 1}`} />
                <Button variant="ghost" size="sm" onClick={() => { const updated = data.subQuestions.filter((_, j) => j !== i); setData((p) => ({ ...p, subQuestions: updated })); save({ subQuestions: updated }) }}>✕</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setData((p) => ({ ...p, subQuestions: [...p.subQuestions, ''] }))}>
              + Add question
            </Button>
          </div>
        </WizardStep>
      )}

      {/* Step 6: Hypotheses */}
      {step === 6 && (
        <WizardStep title="What do you expect to find?" subtitle="Step 6 of 6 — Hypotheses">
          <p className="text-sm text-muted-foreground mb-1">
            For each question from Step 5, write down what you <strong>expect</strong> the answer to be.
            Claude will actively try to <strong>disprove</strong> these — that&apos;s how we avoid confirmation bias.
          </p>
          {data.subQuestions.some((q) => q.trim()) && (
            <Button variant="ghost" size="sm" className="h-6 text-xs mb-3 px-0" onClick={syncHypothesesFromSubQuestions}>
              ↻ Use questions from step 5
            </Button>
          )}
          <div className="space-y-4">
            {data.hypotheses.map((h, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hypothesis {i + 1}</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { const updated = data.hypotheses.filter((_, j) => j !== i); setData((p) => ({ ...p, hypotheses: updated })); save({ hypotheses: updated }) }}>Remove</Button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Question</Label>
                  <Input value={h.question} onChange={(e) => { const updated = [...data.hypotheses]; updated[i] = { ...updated[i], question: e.target.value }; setData((p) => ({ ...p, hypotheses: updated })) }}
                    onBlur={() => save({ hypotheses: data.hypotheses })} placeholder="e.g. Are mobile users dropping off at the payment step?" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Your assumed answer</Label>
                  <Input value={h.hypothesis} onChange={(e) => { const updated = [...data.hypotheses]; updated[i] = { ...updated[i], hypothesis: e.target.value }; setData((p) => ({ ...p, hypotheses: updated })) }}
                    onBlur={() => save({ hypotheses: data.hypotheses })} placeholder="e.g. Yes, because the payment form doesn't work well on mobile" />
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setData((p) => ({ ...p, hypotheses: [...p.hypotheses, { question: '', hypothesis: '' }] }))}>
              + Add hypothesis
            </Button>
          </div>
        </WizardStep>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between mt-8">
        <Button variant="ghost" onClick={back} disabled={step === 1}>← Back</Button>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
          {step < 6 ? (
            <Button onClick={next} disabled={!canAdvance}>Next →</Button>
          ) : (
            <Button onClick={runAnalysis} disabled={data.status === 'running' || !data.coreQuestion}>
              {data.status === 'running' ? 'Running…' : '🔬 Run analysis'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function WizardStep({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{subtitle}</p>
      <h3 className="text-xl font-semibold mb-5">{title}</h3>
      {children}
    </div>
  )
}

function Opt() {
  return <span className="text-muted-foreground font-normal text-xs">(optional)</span>
}
