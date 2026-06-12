/**
 * Claude analysis agent.
 *
 * Builds a taxonomy-aware system prompt and streams tool-use responses.
 * The full event taxonomy (names, triggers, parameters, types, examples, notes)
 * is injected into the system prompt so Claude understands what each event means.
 */
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { getGoogleAccessToken } from '@/lib/token'
import * as ga4 from '@/lib/ga4Report'
import { getPropertyCurrency } from '@/lib/ga4'

const MODEL = 'claude-sonnet-4-5'

// ─── Types ───────────────────────────────────────────────────────────────────

export type StreamEvent =
  | { type: 'text';       delta: string }
  | { type: 'tool_start'; name: string }
  | { type: 'tool_done';  name: string; summary: string }
  | { type: 'done' }
  | { type: 'error';      message: string }

type ToolCall = { name: string; summary: string }

// ─── Date context ────────────────────────────────────────────────────────────

/**
 * Tells Claude what "today" is so it can resolve relative periods ("last
 * month", "this week", "last quarter", "year to date") into real start/end
 * dates instead of guessing based on its training cutoff.
 */
export function getCurrentDateContext(): string {
  const now = new Date()
  const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(now)
  const weekday = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long' }).format(now)

  return `## Current date

Today is ${weekday}, ${isoDate} (Australia/Sydney time). When the user asks for a relative period — "last month", "this week", "last quarter", "year to date", etc. — compute the actual start_date/end_date from this date; don't guess based on your training data. For ranges anchored to today you can also use GA4's relative date strings ('today', 'yesterday', 'NdaysAgo').`
}

// ─── Currency context ────────────────────────────────────────────────────────

/**
 * Tells Claude which currency to use for monetary figures (revenue, average
 * order value, opportunity sizing, etc.) — based on the GA4 property's
 * actual configured currency, not an assumed one.
 */
export function getCurrencyContext(currencyCode: string): string {
  const symbol = (() => {
    try {
      return new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode, currencyDisplay: 'narrowSymbol' })
        .formatToParts(1)
        .find((p) => p.type === 'currency')?.value ?? currencyCode
    } catch {
      return currencyCode
    }
  })()

  return `## Currency

This GA4 property's configured currency is **${currencyCode}** (${symbol}). All monetary figures returned by the GA4 tools (revenue, average order value, etc.) are already in this currency. When writing or estimating monetary figures yourself — e.g. revenue opportunity sizing, "X opportunity" framing — use "${symbol}" or "${currencyCode}", never a different currency symbol.`
}

// ─── System prompt ───────────────────────────────────────────────────────────

async function buildSystemPrompt(projectId: string, currencyCode: string): Promise<string> {
  const [project, events, documents] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: { name: true, ga4PropertyId: true },
    }),
    db.event.findMany({
      where: { projectId },
      include: {
        parameters: {
          include: { parameter: { select: { name: true, type: true, description: true, example: true } } },
          orderBy: { parameter: { name: 'asc' } },
        },
      },
      orderBy: { name: 'asc' },
    }),
    db.analysisDocument.findMany({
      where: { projectId },
      select: { id: true, title: true, sourceType: true, source: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Build taxonomy block
  const taxonomyLines = events.map((e) => {
    const params = e.parameters
      .map((ep) => {
        const p = ep.parameter
        const ex = p.example ? ` e.g. "${p.example}"` : ''
        return `    • ${p.name} (${p.type}${ex})${p.description ? `: ${p.description}` : ''}`
      })
      .join('\n')
    const meta = [
      e.category ? `category: ${e.category}` : '',
      e.isKeyEvent ? 'KEY EVENT (conversion)' : '',
      e.requiresDataLayer ? 'requires dataLayer push' : '',
    ].filter(Boolean).join(' | ')
    return [
      `**${e.name}**${meta ? `  [${meta}]` : ''}`,
      e.trigger ? `  Trigger: ${e.trigger}` : '',
      e.notes ? `  Notes: ${e.notes}` : '',
      params ? `  Parameters:\n${params}` : '  Parameters: none',
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  const keyEvents = events.filter((e) => e.isKeyEvent).map((e) => e.name).join(', ')

  // Build research library summary
  const docsBlock = documents.length > 0
    ? documents.map((d) =>
        `- [${d.id}] "${d.title}" (${d.sourceType}${d.source ? `, ${d.source}` : ''}, ${d.createdAt.toLocaleDateString()})`
      ).join('\n')
    : 'No research documents uploaded yet.'

  return `You are an expert digital analytics and UX consultant working on the **${project?.name ?? 'this'}** project.

You have access to their GA4 data and a library of qualitative research. Your job is to help understand user behaviour, diagnose problems, and identify opportunities.

When answering:
- Pull data before answering — don't guess at numbers
- Cross-reference GA4 data with qualitative research when available
- Be specific: name events, pages, drop-off rates, user quotes
- Quantify commercial impact where possible
- Suggest concrete A/B test hypotheses with clear success metrics
- Prioritise issues by severity × frequency × revenue impact

${getCurrentDateContext()}

${getCurrencyContext(currencyCode)}

## Event taxonomy for this project

These are all tracked events. Use these exact event names when querying GA4:

${taxonomyLines}

${keyEvents ? `**Key events (conversions):** ${keyEvents}` : ''}

## Available research documents

Use the search_documents tool to retrieve content from these documents:

${docsBlock}`
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'run_ga4_report',
    description: 'Run a custom GA4 report. Use for traffic, events, conversions, revenue, or user behaviour. Common dimensions: pagePath, deviceCategory, country, eventName, sessionSource, sessionMedium. Common metrics: sessions, totalUsers, conversions, totalRevenue, bounceRate, averageSessionDuration, eventCount.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dimensions:  { type: 'array', items: { type: 'string' }, description: "e.g. ['pagePath', 'deviceCategory']" },
        metrics:     { type: 'array', items: { type: 'string' }, description: "e.g. ['sessions', 'totalRevenue']" },
        date_ranges: {
          type: 'array',
          items: { type: 'object', properties: { start_date: { type: 'string' }, end_date: { type: 'string' } }, required: ['start_date', 'end_date'] },
          description: "Use '30daysAgo', 'yesterday', 'today', or 'YYYY-MM-DD'. Pass two ranges to compare periods.",
        },
        limit: { type: 'integer', description: 'Max rows. Default 20.', default: 20 },
      },
      required: ['dimensions', 'metrics', 'date_ranges'],
    },
  },
  {
    name: 'get_funnel_data',
    description: 'Get step-by-step funnel data showing how many users complete each step. Use for checkout funnels, sign-up flows, onboarding sequences.',
    input_schema: {
      type: 'object' as const,
      properties: {
        steps: {
          type: 'array',
          items: { type: 'object', properties: { name: { type: 'string' }, event: { type: 'string' } }, required: ['name', 'event'] },
          description: 'Funnel steps in order. Use exact GA4 event names from the taxonomy.',
        },
        date_range: { type: 'object', properties: { start_date: { type: 'string' }, end_date: { type: 'string' } }, required: ['start_date', 'end_date'] },
      },
      required: ['steps', 'date_range'],
    },
  },
  {
    name: 'get_page_performance',
    description: 'Get performance metrics for all pages: page views, session duration, bounce rate, conversions. Use to identify underperforming pages.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_range: { type: 'object', properties: { start_date: { type: 'string' }, end_date: { type: 'string' } }, required: ['start_date', 'end_date'] },
        limit: { type: 'integer', default: 25 },
      },
      required: ['date_range'],
    },
  },
  {
    name: 'get_top_events',
    description: 'Get the most frequent GA4 events. Use to understand what users are doing and spot missing or unexpected events. Returns event names with counts — cross-reference with the taxonomy above to interpret meaning.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_range: { type: 'object', properties: { start_date: { type: 'string' }, end_date: { type: 'string' } }, required: ['start_date', 'end_date'] },
      },
      required: ['date_range'],
    },
  },
  {
    name: 'get_conversion_trend',
    description: 'Get daily conversion and revenue data. Use to identify drops, spikes, or trends. Pass two date ranges to compare periods.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_ranges: {
          type: 'array',
          items: { type: 'object', properties: { start_date: { type: 'string' }, end_date: { type: 'string' } } },
          description: 'Use two ranges to compare e.g. last 30 days vs previous 30 days',
        },
      },
      required: ['date_ranges'],
    },
  },
  {
    name: 'search_documents',
    description: 'Search qualitative research: user testing notes, surveys, session replay summaries, support tickets, interviews. Use to find evidence that explains quantitative patterns or to answer questions about user pain points.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: "What you're looking for e.g. 'checkout payment confusion'" },
        limit: { type: 'integer', default: 5 },
      },
      required: ['query'],
    },
  },
]

// ─── Tool execution ──────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  projectId: string,
  accessToken: string,
  propertyId: string,
): Promise<string> {
  try {
    let data: unknown

    if (name === 'run_ga4_report') {
      data = await ga4.runReport(
        accessToken, propertyId,
        input.dimensions as string[],
        input.metrics as string[],
        input.date_ranges as { start_date: string; end_date: string }[],
        (input.limit as number) ?? 20,
      )
    } else if (name === 'get_funnel_data') {
      data = await ga4.getFunnelData(
        accessToken, propertyId,
        input.steps as { name: string; event: string }[],
        input.date_range as { start_date: string; end_date: string },
      )
    } else if (name === 'get_page_performance') {
      data = await ga4.getPagePerformance(
        accessToken, propertyId,
        input.date_range as { start_date: string; end_date: string },
        (input.limit as number) ?? 25,
      )
    } else if (name === 'get_top_events') {
      data = await ga4.getTopEvents(
        accessToken, propertyId,
        input.date_range as { start_date: string; end_date: string },
      )
    } else if (name === 'get_conversion_trend') {
      data = await ga4.getConversionTrend(
        accessToken, propertyId,
        input.date_ranges as { start_date: string; end_date: string }[],
      )
    } else if (name === 'search_documents') {
      const query = (input.query as string).toLowerCase()
      const limit = (input.limit as number) ?? 5
      const docs = await db.analysisDocument.findMany({
        where: {
          projectId,
          OR: [
            { title:   { contains: query } },
            { content: { contains: query } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      })
      data = docs.map((d) => ({
        id: d.id,
        title: d.title,
        type: d.sourceType,
        source: d.source,
        content: d.content.slice(0, 3000) + (d.content.length > 3000 ? '…' : ''),
      }))
    } else {
      return JSON.stringify({ error: `Unknown tool: ${name}` })
    }

    return JSON.stringify(data, null, 2)
  } catch (err) {
    return JSON.stringify({ error: String(err) })
  }
}

// ─── Main streaming function ─────────────────────────────────────────────────

export async function* streamAnalysis(
  projectId: string,
  userId: string,
  chatId: string,
  userMessage: string,
): AsyncGenerator<StreamEvent> {
  // Load project + credentials
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { ga4PropertyId: true },
  })
  const propertyId = project?.ga4PropertyId ?? ''

  // Get access token
  const accessToken = await getGoogleAccessToken()
  if (!accessToken) {
    yield { type: 'error', message: 'No Google access token — please sign out and sign back in.' }
    return
  }

  // Load chat history
  const history = await db.analysisMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
  })

  // Build conversation
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))
  messages.push({ role: 'user', content: userMessage })

  // Build system prompt (includes taxonomy + doc list)
  const currencyCode = await getPropertyCurrency(accessToken, propertyId)
  const systemPrompt = await buildSystemPrompt(projectId, currencyCode)

  const client = new Anthropic()
  const toolCallsForMessage: ToolCall[] = []
  let fullText = ''

  // Save user message
  await db.analysisMessage.create({
    data: { chatId, role: 'user', content: userMessage },
  })

  // Agentic loop
  const conversation = [...messages]

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
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolUse = { id: event.content_block.id, name: event.content_block.name }
          currentInputJson = ''
          yield { type: 'tool_start', name: currentToolUse.name }
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          responseText += event.delta.text
          fullText += event.delta.text
          yield { type: 'text', delta: event.delta.text }
        } else if (event.delta.type === 'input_json_delta') {
          currentInputJson += event.delta.partial_json
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolUse) {
          let parsedInput: Record<string, unknown> = {}
          try { parsedInput = JSON.parse(currentInputJson || '{}') } catch { /* ignore */ }
          toolUses.push({ id: currentToolUse.id, name: currentToolUse.name, input: parsedInput })
          currentToolUse = null
        }
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason ?? null
      }
    }

    // Add assistant turn to conversation
    const assistantContent: Anthropic.MessageParam['content'] = []
    if (responseText) (assistantContent as Anthropic.ContentBlockParam[]).push({ type: 'text', text: responseText })
    for (const tu of toolUses) {
      (assistantContent as Anthropic.ContentBlockParam[]).push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input })
    }
    if ((assistantContent as Anthropic.ContentBlockParam[]).length) {
      conversation.push({ role: 'assistant', content: assistantContent })
    }

    if (stopReason === 'end_turn' || toolUses.length === 0) break

    // Execute tools
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const result = await executeTool(tu.name, tu.input, projectId, accessToken, propertyId)
      const summary = result.length > 150 ? result.slice(0, 150) + '…' : result
      toolCallsForMessage.push({ name: tu.name, summary })
      yield { type: 'tool_done', name: tu.name, summary }
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
    }
    conversation.push({ role: 'user', content: toolResults })
  }

  // Save assistant message
  await db.analysisMessage.create({
    data: {
      chatId,
      role: 'assistant',
      content: fullText,
      toolCalls: JSON.stringify(toolCallsForMessage),
    },
  })

  // Auto-title the chat from first exchange
  const chat = await db.analysisChat.findUnique({ where: { id: chatId }, select: { title: true, messages: { take: 1 } } })
  if (chat?.title === 'New chat') {
    const title = userMessage.length > 60 ? userMessage.slice(0, 57) + '…' : userMessage
    await db.analysisChat.update({ where: { id: chatId }, data: { title } })
  }

  yield { type: 'done' }
}
