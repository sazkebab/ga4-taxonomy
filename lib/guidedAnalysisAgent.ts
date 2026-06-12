/**
 * Guided analysis agent.
 *
 * Takes a completed wizard (core question + use case + stakeholder context + hypotheses)
 * and produces a structured report that tests each hypothesis —
 * prioritising evidence that disproves the user's assumptions.
 */
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { getGoogleAccessToken } from '@/lib/token'
import { getPropertyCurrency } from '@/lib/ga4'
import { TOOLS, executeTool, getCurrentDateContext, getCurrencyContext } from '@/lib/analysisAgent'

const MODEL = 'claude-sonnet-4-5'

// ─── Framing templates ───────────────────────────────────────────────────────

const USE_CASE_FRAMING: Record<string, string> = {
  inform_ux_design:    'Frame every insight as a design problem and solution. Reference specific pages, flows, and UI elements. Suggest concrete changes.',
  run_experiments:     'Frame every insight as a testable A/B hypothesis with: control, variant, primary metric, minimum detectable effect, and estimated sample size.',
  change_campaigns:    'Frame insights in terms of acquisition channel performance, audience behaviour differences, and campaign optimisation opportunities.',
  email_customers:     'Frame insights around customer segments, trigger points, and what message would be most relevant to the affected users.',
  build_business_case: 'Lead with revenue impact. Quantify every problem: sessions affected × conversion rate × average order value = opportunity size, in the property\'s configured currency (see Currency section below). Include effort/impact ratio.',
}

const LITERACY_FRAMING: Record<string, string> = {
  low:    'Use plain English. Avoid jargon. Explain what each metric means. Use percentages not decimals. Use analogies where helpful.',
  medium: 'Use standard analytics terminology. Briefly define any specialist terms. Show both percentages and absolute numbers.',
  high:   'Use precise technical language. Include raw numbers, statistical context, and methodology notes. No need to explain standard metrics.',
}

// ─── Guided analysis data shape ───────────────────────────────────────────────

export interface GuidedAnalysisData {
  id:                  string
  projectId:           string
  coreQuestion:        string
  useCase:             string
  stakeholderName:     string
  stakeholderLiteracy: string
  keyKpis:             string[]
  insightDestination:  string
  preferredOutputStyle:string
  priorKnowledge:      string
  subQuestions:        string[]
  hypotheses:          { question: string; hypothesis: string }[]
}

// ─── System prompt builder ───────────────────────────────────────────────────

async function buildGuidedSystemPrompt(data: GuidedAnalysisData, projectId: string, currencyCode: string): Promise<string> {
  // Load taxonomy for context
  const events = await db.event.findMany({
    where: { projectId },
    include: {
      parameters: {
        include: { parameter: { select: { name: true, type: true, example: true } } },
      },
    },
    orderBy: { name: 'asc' },
  })

  const taxonomySummary = events.map((e) => {
    const params = e.parameters.map((ep) => ep.parameter.name).join(', ')
    return `- **${e.name}**${e.isKeyEvent ? ' [KEY EVENT]' : ''}${e.category ? ` (${e.category})` : ''}: ${e.trigger || 'no trigger'}${params ? ` | params: ${params}` : ''}`
  }).join('\n')

  // useCase may be a JSON array (multi-select) or a legacy single string
  const useCaseKeys: string[] = (() => {
    if (!data.useCase) return []
    try { return JSON.parse(data.useCase) } catch { return data.useCase ? [data.useCase] : [] }
  })()
  const useCaseText = useCaseKeys.length > 0
    ? useCaseKeys
        .map((k, i) => `${i + 1}. **${k.replace(/_/g, ' ')}**: ${USE_CASE_FRAMING[k] ?? ''}`)
        .join('\n')
    : ''
  const literacyText  = LITERACY_FRAMING[data.stakeholderLiteracy] ?? LITERACY_FRAMING.medium

  const hypothesesText = data.hypotheses.length > 0
    ? '\n\nHYPOTHESES TO TEST:\n' + data.hypotheses.map((h, i) =>
        `  ${i + 1}. Q: ${h.question}\n     Assumed answer: ${h.hypothesis}`
      ).join('\n')
    : ''

  const subQText = data.subQuestions.length > 0
    ? '\n\nSUB-QUESTIONS TO ANSWER:\n' + data.subQuestions.map((q) => `  - ${q}`).join('\n')
    : ''

  return `You are a senior digital analytics consultant conducting a structured analysis.

CORE QUESTION: ${data.coreQuestion}

PURPOSE${useCaseKeys.length > 1 ? 'S (address all of these in your report)' : ''}: ${useCaseText}

STAKEHOLDER: ${data.stakeholderName || 'The main stakeholder'}
DATA LITERACY: ${literacyText}

KEY KPIs: ${data.keyKpis.join(', ') || 'not specified'}
WHERE THIS INSIGHT GOES: ${data.insightDestination || 'not specified'}
OUTPUT STYLE PREFERENCE: ${data.preferredOutputStyle || 'not specified'}

WHAT THE USER ALREADY KNOWS:
${data.priorKnowledge || 'Nothing specified'}
${subQText}${hypothesesText}

${getCurrentDateContext()}

${getCurrencyContext(currencyCode)}

## Event taxonomy
${taxonomySummary}

YOUR JOB:
1. Pull all data needed to answer the core question and each sub-question
2. For each hypothesis: actively look for evidence that DISPROVES it first — confirmation bias is the enemy
3. Be honest: if data supports a hypothesis say so; if it contradicts it, say so clearly
4. Produce a structured report with:
   - Executive summary (2-3 sentences)
   - For each hypothesis: verdict (CONFIRMED / DISPROVED / INCONCLUSIVE) + evidence + implication
   - Top 3 prioritised recommendations with commercial impact estimates
   - Suggested next steps

Pull all relevant data before writing your report. Use multiple tool calls if needed.

IMPORTANT: Never sign off or attribute the report to "Senior Digital Analytics Consultant" or any other human-sounding job title — you are an AI, not a person on the team. If you include any "Prepared by" / author / attribution line at all, it must read exactly "Report Prepared By: AI".`
}

// ─── Suggest sub-questions ───────────────────────────────────────────────────

export async function suggestSubQuestions(data: GuidedAnalysisData): Promise<string[]> {
  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Generate 4-5 specific, answerable sub-questions that together would fully answer this core question.
Each sub-question should be answerable with web analytics data or user research.

Core question: ${data.coreQuestion}
Business context: ${data.insightDestination}
Key KPIs: ${data.keyKpis.join(', ')}
Prior knowledge: ${data.priorKnowledge}

Return ONLY a JSON array of strings, e.g. ["question 1", "question 2"]`,
    }],
  })

  let text = (response.content[0] as { type: 'text'; text: string }).text.trim()

  // Strip a wrapping ```json ... ``` (or plain ``` ... ```) code fence, if present.
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/)
  if (fenceMatch) text = fenceMatch[1].trim()

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.filter((q): q is string => typeof q === 'string')
    throw new Error('response was not a JSON array')
  } catch {
    throw new Error(`AI returned an unexpected response: ${text.slice(0, 200)}`)
  }
}

// ─── Background guided analysis run ──────────────────────────────────────────

/**
 * Runs the full guided analysis to completion, persisting progress to the DB
 * as it goes (`reportMarkdown` after each turn, `progressLog` after each tool
 * call). Designed to be kicked off "fire and forget" from a route handler so
 * the run keeps going even if the client disconnects — the frontend polls the
 * `GuidedAnalysis` record for live progress instead of consuming an SSE stream.
 *
 * The Google access token must be resolved by the caller (request-scoped
 * `auth()` isn't safe to call from a detached background task) and passed in.
 *
 * Throws on error — the caller is responsible for catching it and persisting
 * `status: 'error'`.
 */
export async function runGuidedAnalysis(
  data: GuidedAnalysisData,
  accessToken: string,
): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: data.projectId },
    select: { ga4PropertyId: true },
  })
  const propertyId = project?.ga4PropertyId ?? ''

  const currencyCode = await getPropertyCurrency(accessToken, propertyId)
  const systemPrompt = await buildGuidedSystemPrompt(data, data.projectId, currencyCode)
  const initialMessage = `Please conduct a full analysis to answer: "${data.coreQuestion}"${
    data.subQuestions.length ? '\n\nSub-questions:\n' + data.subQuestions.map((q) => `- ${q}`).join('\n') : ''
  }\n\nPull all relevant GA4 data and search qualitative research to test each hypothesis. Start with the data — write the report after you have the evidence.`

  const client = new Anthropic()
  const conversation: Anthropic.MessageParam[] = [{ role: 'user', content: initialMessage }]
  let fullReport = ''
  const progress: { name: string; summary: string }[] = []

  while (true) {
    let responseText = ''
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
        currentToolUse = { id: event.content_block.id, name: event.content_block.name }
        currentInputJson = ''
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          responseText += event.delta.text
          fullReport  += event.delta.text
        } else if (event.delta.type === 'input_json_delta') {
          currentInputJson += event.delta.partial_json
        }
      } else if (event.type === 'content_block_stop' && currentToolUse) {
        try { currentToolUse = { ...currentToolUse, ...{ input: JSON.parse(currentInputJson || '{}') } } } catch { /* ignore */ }
        toolUses.push({ id: currentToolUse.id, name: currentToolUse.name, input: JSON.parse(currentInputJson || '{}') })
        currentToolUse = null
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason ?? null
      }
    }

    // Persist the report-so-far after every turn so a polling client sees progress.
    if (responseText) {
      await db.guidedAnalysis.update({ where: { id: data.id }, data: { reportMarkdown: fullReport } })
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
      const result = await executeTool(tu.name, tu.input, data.projectId, accessToken, propertyId)
      const summary = result.length > 150 ? result.slice(0, 150) + '…' : result
      progress.push({ name: tu.name, summary })
      await db.guidedAnalysis.update({ where: { id: data.id }, data: { progressLog: JSON.stringify(progress) } })
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
    }
    conversation.push({ role: 'user', content: toolResults })
  }

  // Save the final report
  await db.guidedAnalysis.update({
    where: { id: data.id },
    data: {
      status:        'complete',
      reportMarkdown: fullReport,
      completedAt:   new Date(),
    },
  })
}

// ─── Drill-down on a selected section of a finished report ───────────────────

/**
 * A user has highlighted a passage from a completed guided-analysis report and
 * wants more detail or to see the underlying data behind it. Runs a focused,
 * tool-using investigation (separate from the main report) and returns markdown.
 *
 * Runs synchronously within the request — unlike `runGuidedAnalysis`, this is
 * short enough not to need the background-task treatment, so it's safe to call
 * `getGoogleAccessToken()` directly here.
 */
export async function runGuidedDrillDown(
  selection: string,
  context: { projectId: string; coreQuestion: string; stakeholderLiteracy: string },
): Promise<string> {
  const project = await db.project.findUnique({
    where: { id: context.projectId },
    select: { ga4PropertyId: true },
  })
  const propertyId = project?.ga4PropertyId ?? ''

  const accessToken = await getGoogleAccessToken()
  if (!accessToken) return '⚠️ No Google access token — please sign out and sign back in.'

  const currencyCode = await getPropertyCurrency(accessToken, propertyId)
  const literacyText = LITERACY_FRAMING[context.stakeholderLiteracy] ?? LITERACY_FRAMING.medium

  const systemPrompt = `You are a senior digital analytics consultant. A stakeholder is reading a guided analysis report that answers this question:

CORE QUESTION: ${context.coreQuestion}

They've highlighted one section of the report and want more detail or to see the underlying data behind it.

${literacyText}
${getCurrentDateContext()}

${getCurrencyContext(currencyCode)}

Pull whatever GA4 data is needed to dig into the highlighted section — break it down further (by segment, channel, device, page, time period etc.) and surface the actual numbers behind the claim. Be specific and evidence-based. Use multiple tool calls if needed, then write a focused markdown response (a couple of short paragraphs and/or a small data table — no headings needed).

Never refer to yourself as "Senior Digital Analytics Consultant" or any other human-sounding job title — you are an AI. If your response includes any "Prepared by" / author / attribution line at all, it must read exactly "Report Prepared By: AI".`

  const client = new Anthropic()
  const conversation: Anthropic.MessageParam[] = [{
    role: 'user',
    content: `Here's the section I highlighted from the report:\n\n"${selection}"\n\nPlease dig into this — pull the underlying data and explain what's driving it.`,
  }]

  let fullResponse = ''
  const MAX_TURNS = 4

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let turnText = ''
    const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = []
    let currentToolUse: { id: string; name: string } | null = null
    let currentInputJson = ''
    let stopReason: string | null = null

    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: conversation,
      tools: TOOLS,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        currentToolUse = { id: event.content_block.id, name: event.content_block.name }
        currentInputJson = ''
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          turnText += event.delta.text
        } else if (event.delta.type === 'input_json_delta') {
          currentInputJson += event.delta.partial_json
        }
      } else if (event.type === 'content_block_stop' && currentToolUse) {
        toolUses.push({ id: currentToolUse.id, name: currentToolUse.name, input: JSON.parse(currentInputJson || '{}') })
        currentToolUse = null
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason ?? null
      }
    }

    fullResponse += turnText

    const assistantContent: Anthropic.ContentBlockParam[] = []
    if (turnText) assistantContent.push({ type: 'text', text: turnText })
    for (const tu of toolUses) assistantContent.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input })
    if (assistantContent.length) conversation.push({ role: 'assistant', content: assistantContent })

    if (stopReason !== 'tool_use' || toolUses.length === 0) break

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const result = await executeTool(tu.name, tu.input, context.projectId, accessToken, propertyId)
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
    }
    conversation.push({ role: 'user', content: toolResults })
  }

  return fullResponse.trim() || 'No additional detail was generated — try selecting a more specific passage.'
}

// ─── Chat-based amendment of a selected section of a finished report ─────────

export interface AmendTurn { role: 'user' | 'assistant'; content: string }

const DEFAULT_AMEND_INSTRUCTION = 'Please check this section for accuracy against the real GA4 data — especially any figures, percentages, dates, and currency — and propose a corrected version if anything is wrong. If it already looks correct, say so and repeat it unchanged in the REVISED section.'

/**
 * A user has highlighted a passage from a completed guided-analysis report that
 * they believe contains an error (wrong figures, wrong currency, claims that
 * don't match the underlying data, etc.) and wants Claude to investigate and
 * propose a corrected version of that passage. Supports an ongoing back-and-forth
 * — pass the prior `history` plus a new `userMessage` to refine the proposal.
 *
 * Runs synchronously within the request, like `runGuidedDrillDown`.
 */
export async function runGuidedAmendment(
  selection: string,
  history: AmendTurn[],
  userMessage: string | null,
  context: { projectId: string; coreQuestion: string; stakeholderLiteracy: string },
): Promise<{ explanation: string; proposedText: string; rawResponse: string; userMessage: string }> {
  const resolvedUserMessage = userMessage ?? DEFAULT_AMEND_INSTRUCTION

  const project = await db.project.findUnique({
    where: { id: context.projectId },
    select: { ga4PropertyId: true },
  })
  const propertyId = project?.ga4PropertyId ?? ''

  const accessToken = await getGoogleAccessToken()
  if (!accessToken) {
    return {
      explanation:  '⚠️ No Google access token — please sign out and sign back in.',
      proposedText: '',
      rawResponse:  '',
      userMessage:  resolvedUserMessage,
    }
  }

  const currencyCode = await getPropertyCurrency(accessToken, propertyId)
  const literacyText = LITERACY_FRAMING[context.stakeholderLiteracy] ?? LITERACY_FRAMING.medium

  const systemPrompt = `You are a senior digital analytics consultant helping correct a section of a guided analysis report that answers this question:

CORE QUESTION: ${context.coreQuestion}

THE HIGHLIGHTED SECTION TO CHECK/CORRECT:
"""
${selection}
"""

${literacyText}
${getCurrentDateContext()}

${getCurrencyContext(currencyCode)}

Investigate using the GA4 tools as needed to verify the figures, percentages, dates, currency and claims in the highlighted section against real data. Use multiple tool calls if needed.

Respond using EXACTLY this format, with nothing before or after:

EXPLANATION:
<1-3 sentences: what you checked, and what (if anything) was wrong and what you changed. If the user asks a follow-up or pushes back, address that here too.>

REVISED:
<the full corrected replacement text for the highlighted section, written in the same markdown style and similar length/structure as the original — this will directly replace the highlighted text in the report verbatim>

Never refer to yourself as "Senior Digital Analytics Consultant" or any other human-sounding job title — you are an AI. If the revised text includes any "Prepared by" / author / attribution line at all, it must read exactly "Report Prepared By: AI".`

  const client = new Anthropic()
  const conversation: Anthropic.MessageParam[] = [
    ...history.map((h): Anthropic.MessageParam => ({ role: h.role, content: h.content })),
    { role: 'user', content: resolvedUserMessage },
  ]

  let fullResponse = ''
  const MAX_TURNS = 4

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let turnText = ''
    const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = []
    let currentToolUse: { id: string; name: string } | null = null
    let currentInputJson = ''
    let stopReason: string | null = null

    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: conversation,
      tools: TOOLS,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        currentToolUse = { id: event.content_block.id, name: event.content_block.name }
        currentInputJson = ''
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          turnText += event.delta.text
        } else if (event.delta.type === 'input_json_delta') {
          currentInputJson += event.delta.partial_json
        }
      } else if (event.type === 'content_block_stop' && currentToolUse) {
        toolUses.push({ id: currentToolUse.id, name: currentToolUse.name, input: JSON.parse(currentInputJson || '{}') })
        currentToolUse = null
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason ?? null
      }
    }

    fullResponse += turnText

    const assistantContent: Anthropic.ContentBlockParam[] = []
    if (turnText) assistantContent.push({ type: 'text', text: turnText })
    for (const tu of toolUses) assistantContent.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input })
    if (assistantContent.length) conversation.push({ role: 'assistant', content: assistantContent })

    if (stopReason !== 'tool_use' || toolUses.length === 0) break

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const result = await executeTool(tu.name, tu.input, context.projectId, accessToken, propertyId)
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
    }
    conversation.push({ role: 'user', content: toolResults })
  }

  const trimmed = fullResponse.trim()
  const match   = trimmed.match(/EXPLANATION:\s*([\s\S]*?)\n+REVISED:\s*([\s\S]*)/i)
  const explanation  = match ? match[1].trim() : (trimmed || 'No response was generated — please try again.')
  const proposedText = match ? match[2].trim() : ''

  return { explanation, proposedText, rawResponse: trimmed, userMessage: resolvedUserMessage }
}
