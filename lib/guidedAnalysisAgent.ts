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
import { TOOLS, executeTool, StreamEvent } from '@/lib/analysisAgent'

const MODEL = 'claude-sonnet-4-5'

// ─── Framing templates ───────────────────────────────────────────────────────

const USE_CASE_FRAMING: Record<string, string> = {
  inform_ux_design:    'Frame every insight as a design problem and solution. Reference specific pages, flows, and UI elements. Suggest concrete changes.',
  run_experiments:     'Frame every insight as a testable A/B hypothesis with: control, variant, primary metric, minimum detectable effect, and estimated sample size.',
  change_campaigns:    'Frame insights in terms of acquisition channel performance, audience behaviour differences, and campaign optimisation opportunities.',
  email_customers:     'Frame insights around customer segments, trigger points, and what message would be most relevant to the affected users.',
  build_business_case: 'Lead with revenue impact. Quantify every problem: sessions affected × conversion rate × average order value = £X opportunity. Include effort/impact ratio.',
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

async function buildGuidedSystemPrompt(data: GuidedAnalysisData, projectId: string): Promise<string> {
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

  const useCaseText   = USE_CASE_FRAMING[data.useCase] ?? ''
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

PURPOSE: ${useCaseText}

STAKEHOLDER: ${data.stakeholderName || 'The main stakeholder'}
DATA LITERACY: ${literacyText}

KEY KPIs: ${data.keyKpis.join(', ') || 'not specified'}
WHERE THIS INSIGHT GOES: ${data.insightDestination || 'not specified'}
OUTPUT STYLE PREFERENCE: ${data.preferredOutputStyle || 'not specified'}

WHAT THE USER ALREADY KNOWS:
${data.priorKnowledge || 'Nothing specified'}
${subQText}${hypothesesText}

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

Pull all relevant data before writing your report. Use multiple tool calls if needed.`
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

  try {
    let text = (response.content[0] as { type: 'text'; text: string }).text.trim()
    if (text.startsWith('```')) text = text.split('\n', 2)[1].split('```')[0].trim()
    return JSON.parse(text) as string[]
  } catch {
    return []
  }
}

// ─── Streaming guided analysis ───────────────────────────────────────────────

export async function* streamGuidedAnalysis(
  data: GuidedAnalysisData,
): AsyncGenerator<StreamEvent> {
  const project = await db.project.findUnique({
    where: { id: data.projectId },
    select: { ga4PropertyId: true },
  })
  const propertyId = project?.ga4PropertyId ?? ''

  const accessToken = await getGoogleAccessToken()
  if (!accessToken) {
    yield { type: 'error', message: 'No Google access token — please sign out and sign back in.' }
    return
  }

  const systemPrompt = await buildGuidedSystemPrompt(data, data.projectId)
  const initialMessage = `Please conduct a full analysis to answer: "${data.coreQuestion}"${
    data.subQuestions.length ? '\n\nSub-questions:\n' + data.subQuestions.map((q) => `- ${q}`).join('\n') : ''
  }\n\nPull all relevant GA4 data and search qualitative research to test each hypothesis. Start with the data — write the report after you have the evidence.`

  const client = new Anthropic()
  const conversation: Anthropic.MessageParam[] = [{ role: 'user', content: initialMessage }]
  let fullReport = ''

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
        yield { type: 'tool_start', name: currentToolUse.name }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          responseText += event.delta.text
          fullReport  += event.delta.text
          yield { type: 'text', delta: event.delta.text }
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
      yield { type: 'tool_done', name: tu.name, summary }
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
    }
    conversation.push({ role: 'user', content: toolResults })
  }

  // Save report to DB
  await db.guidedAnalysis.update({
    where: { id: data.id },
    data: {
      status:        'complete',
      reportMarkdown: fullReport,
      completedAt:   new Date(),
    },
  })

  yield { type: 'done' }
}
