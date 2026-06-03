/**
 * GA4 Data Quality Monitoring Agent.
 *
 * Runs autonomously — no user message needed. Pulls GA4 data for the past
 * 7 days vs prior 7 days, cross-references against the event taxonomy,
 * applies custom prompts and suppressions, and streams a structured health report.
 */
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { getGoogleAccessToken } from '@/lib/token'
import * as ga4 from '@/lib/ga4Report'
import { TOOLS, executeTool } from '@/lib/analysisAgent'

const MODEL = 'claude-sonnet-4-5'

export type QualityStreamEvent =
  | { type: 'text';       delta: string }
  | { type: 'tool_start'; name: string }
  | { type: 'tool_done';  name: string }
  | { type: 'done' }
  | { type: 'error';      message: string }

// ─── System prompt ────────────────────────────────────────────────────────────

async function buildMonitorPrompt(projectId: string): Promise<string> {
  const [project, events, suppressions, customPrompts, dataLayerDoc] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: { name: true, ga4PropertyId: true },
    }),
    db.event.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
      include: {
        parameters: {
          include: {
            parameter: {
              select: { name: true, type: true, description: true, example: true, requiresGA4Registration: true, ga4Registered: true },
            },
          },
          orderBy: { parameter: { name: 'asc' } },
        },
      },
    }),
    db.dataQualitySuppression.findMany({
      where: { projectId, isActive: true },
      select: { content: true, label: true },
    }),
    db.dataQualityPrompt.findMany({
      where: { projectId, isActive: true },
      orderBy: { order: 'asc' },
      select: { title: true, content: true },
    }),
    db.dataLayerDoc.findUnique({
      where: { projectId },
      include: {
        sections: {
          include: {
            event:      { select: { name: true } },
            paramNotes: { select: { paramName: true, example: true, notes: true } },
          },
          orderBy: { order: 'asc' },
        },
      },
    }),
  ])

  // ── Taxonomy block ──────────────────────────────────────────────────────────
  const taxonomyList = events.map((e) => {
    const params = e.parameters.map((ep) => {
      const p = ep.parameter
      const parts = [p.name, p.type]
      if (p.example)     parts.push(`e.g. "${p.example}"`)
      if (p.description) parts.push(p.description)
      if (p.requiresGA4Registration && !p.ga4Registered) parts.push('⚠ not yet registered in GA4')
      return `    • ${parts.join(' — ')}`
    }).join('\n')
    const flags = [
      e.isKeyEvent        ? '★ KEY EVENT'             : '',
      e.requiresDataLayer ? 'needs dataLayer push'    : '',
      e.category          ? `category: ${e.category}` : '',
      e.notes             ? `note: ${e.notes}`         : '',
    ].filter(Boolean).join(' | ')
    return [`**${e.name}**${flags ? `  [${flags}]` : ''}`, params].filter(Boolean).join('\n')
  }).join('\n\n')

  // ── DataLayer docs block ────────────────────────────────────────────────────
  let dataLayerBlock = ''
  if (dataLayerDoc?.sections?.length) {
    const sectionLines = dataLayerDoc.sections.map((s) => {
      const statusParts = [
        s.isDone     ? '✓ doc done'     : '✗ doc not done',
        s.isTested   ? '✓ tested'       : '✗ not tested',
        s.testResult ? `result: ${s.testResult}` : '',
      ].filter(Boolean).join(', ')

      const paramNoteLines = s.paramNotes.length > 0
        ? s.paramNotes.map((pn) =>
            `    • ${pn.paramName}${pn.example ? ` = ${pn.example}` : ''}${pn.notes ? ` (${pn.notes})` : ''}`
          ).join('\n')
        : ''

      return [
        `- **${s.event.name}**: ${statusParts}`,
        paramNoteLines ? `  Parameter notes:\n${paramNoteLines}` : '',
        s.testResult === 'failed' ? `  ⚠ FAILED TEST — may not be firing correctly` : '',
      ].filter(Boolean).join('\n')
    }).join('\n')

    dataLayerBlock = `\n\n## DataLayer implementation status\nThis is the current dev docs status for each event. Use this when assessing whether missing GA4 fires are expected (e.g. not yet implemented) or unexpected (implemented but broken):\n\n${sectionLines}`
  }

  // ── Parameters needing GA4 registration ────────────────────────────────────
  const unregisteredParams = events
    .flatMap((e) => e.parameters.map((ep) => ep.parameter))
    .filter((p, i, arr) => p.requiresGA4Registration && !p.ga4Registered && arr.findIndex((x) => x.name === p.name) === i)

  const unregisteredBlock = unregisteredParams.length > 0
    ? `\n\n## Parameters awaiting GA4 registration\nThese custom parameters are in the taxonomy but not yet registered as custom dimensions/metrics in GA4. Data for these parameters may be missing from reports:\n${unregisteredParams.map((p) => `- ${p.name} (${p.type})`).join('\n')}`
    : ''

  const keyEvents    = events.filter((e) => e.isKeyEvent).map((e) => e.name)
  const suppressList = suppressions.length > 0
    ? '\n\nKNOWN ISSUES TO SKIP (do not flag these):\n' +
      suppressions.map((s) => `- ${s.label || s.content.slice(0, 80)}`).join('\n')
    : ''

  const customChecks = customPrompts.length > 0
    ? '\n\nADDITIONAL CHECKS REQUESTED:\n' +
      customPrompts.map((p) => `### ${p.title}\n${p.content}`).join('\n\n')
    : ''

  return `You are an automated data quality monitoring bot. Your job is to run a weekly health check on the **${project?.name ?? 'this'}** GA4 property and produce a clear, actionable report. You are not a human analyst — always make clear that figures are pulled directly from GA4 and should be independently verified before acting on them.

## Event taxonomy (${events.length} events)
These are ALL events that SHOULD be tracked, with their expected parameters:
${taxonomyList}

Key events (conversions): ${keyEvents.join(', ') || 'none defined'}
${dataLayerBlock}${unregisteredBlock}

## Your task
Run the following checks using the GA4 tools. Compare **last 7 days** vs **prior 7 days** throughout.

### 1. Core metrics health
Pull sessions, users, engaged sessions, conversions, total revenue (if applicable).
Flag any metric that dropped >15% week-over-week as ⚠️ AMBER or >30% as 🔴 RED.
Increases >20% should also be noted (could indicate tracking issues).

### 2. Event inventory audit
Get all events that fired in the last 7 days.
- **Missing events**: events in the taxonomy above that had ZERO fires in the last 7 days. Cross-reference with the dataLayer implementation status — if an event is marked as not yet implemented or failed testing, note that rather than flagging it as a tracking error
- **New/unexpected events**: events firing in GA4 that are NOT in the taxonomy
- **Volume changes**: events with >50% change in fire count week-over-week
- **Parameter quality**: for key events, note if expected parameters (from taxonomy) may be missing or incorrectly formatted based on the parameter examples in the docs

### 3. Key event (conversion) check
For each key event marked ★ above, check fire counts. Flag drops >20%.

### 4. Traffic source health
Break down sessions by channel. Flag major shifts.

### 5. Top pages
List top 10 pages. Flag any unusual drops or new pages appearing in top 10.
${customChecks}${suppressList}

## Report format
Produce a structured markdown report with:

**Overall health: 🟢 GREEN / 🟡 AMBER / 🔴 RED**

Then sections for each check above. Use clear headings, bullet points, and be specific with numbers and % changes. End with a **Recommended actions** section prioritised by impact.

Be direct and actionable. A developer or analyst reading this should immediately know what to investigate.

End every report with a disclaimer section: "---\n*This report was generated automatically by a monitoring bot. All figures are pulled directly from GA4 and should be independently verified before acting on them.*"`
}

// ─── Streaming monitor run ─────────────────────────────────────────────────────

export async function* streamQualityMonitor(
  reportId: string,
  projectId: string,
): AsyncGenerator<QualityStreamEvent> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { ga4PropertyId: true },
  })
  const propertyId = project?.ga4PropertyId ?? ''

  if (!propertyId) {
    yield { type: 'error', message: 'No GA4 property ID set for this project. Add one in GA4 Sync.' }
    return
  }

  const accessToken = await getGoogleAccessToken()
  if (!accessToken) {
    yield { type: 'error', message: 'No Google access token — please sign out and sign back in.' }
    return
  }

  const systemPrompt  = await buildMonitorPrompt(projectId)
  const initialMessage = 'Please run the full GA4 data quality health check now. Pull all the data you need then write the complete report.'

  const client       = new Anthropic()
  const conversation: Anthropic.MessageParam[] = [
    { role: 'user', content: initialMessage },
  ]
  let fullReport = ''

  while (true) {
    let responseText    = ''
    const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = []
    let currentToolUse: { id: string; name: string } | null = null
    let currentInputJson = ''
    let stopReason: string | null = null

    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: 8192,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: conversation,
      tools: TOOLS,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        currentToolUse   = { id: event.content_block.id, name: event.content_block.name }
        currentInputJson = ''
        yield { type: 'tool_start', name: currentToolUse.name }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          responseText += event.delta.text
          fullReport   += event.delta.text
          yield { type: 'text', delta: event.delta.text }
        } else if (event.delta.type === 'input_json_delta') {
          currentInputJson += event.delta.partial_json
        }
      } else if (event.type === 'content_block_stop' && currentToolUse) {
        let input: Record<string, unknown> = {}
        try { input = JSON.parse(currentInputJson || '{}') } catch { /* ignore */ }
        toolUses.push({ id: currentToolUse.id, name: currentToolUse.name, input })
        currentToolUse = null
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason ?? null
      }
    }

    const assistantContent: Anthropic.MessageParam['content'] = []
    if (responseText) (assistantContent as Anthropic.ContentBlockParam[]).push({ type: 'text', text: responseText })
    for (const tu of toolUses) {
      (assistantContent as Anthropic.ContentBlockParam[]).push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input })
    }
    if ((assistantContent as Anthropic.ContentBlockParam[]).length) {
      conversation.push({ role: 'assistant', content: assistantContent })
    }

    if (stopReason === 'end_turn' || toolUses.length === 0) break

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const result = await executeTool(tu.name, tu.input, projectId, accessToken, propertyId)
      yield { type: 'tool_done', name: tu.name }
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
    }
    conversation.push({ role: 'user', content: toolResults })
  }

  // Save report
  await db.dataQualityReport.update({
    where: { id: reportId },
    data: { status: 'complete', reportMarkdown: fullReport, completedAt: new Date() },
  })

  yield { type: 'done' }
}

// ─── Drill-down ───────────────────────────────────────────────────────────────

export async function runDrillDown(
  selection: string,
  projectId: string,
): Promise<string> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { ga4PropertyId: true },
  })
  const propertyId  = project?.ga4PropertyId ?? ''
  const accessToken = await getGoogleAccessToken()
  if (!accessToken) return 'No Google access token available.'

  const client = new Anthropic()
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are a GA4 data quality analyst. A user has selected a finding from a weekly monitoring report and wants more detail. Investigate thoroughly using GA4 data and give a detailed, actionable response.`,
    messages: [{
      role: 'user',
      content: `From the weekly monitoring report, I selected this finding:\n\n"${selection}"\n\nPlease investigate this in more detail. Pull relevant GA4 data and give me specific numbers, root causes, and recommended actions.`,
    }],
    tools: TOOLS,
  })

  // Extract text from response
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('\n')
}
