/**
 * POST /api/clients/[clientId]/projects/[projectId]/datalayer/import
 * Body: { url: string }
 *
 * Fetches a Google Doc by URL, parses its dataLayer documentation structure,
 * and upserts DataLayerSections + DataLayerParamNotes for every section found.
 * Sections that don't match an existing taxonomy event get a brand-new Event
 * created (category auto-detected from the event name), so nothing in the
 * doc is silently dropped.
 *
 * Returns:
 *   { found: number, matched: number, imported: number, created: string[], unmatched: string[], noScope: boolean }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { google } from 'googleapis'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { getGoogleAccessToken } from '@/lib/token'
import { parseGoogleDoc, extractDocId, normaliseEventNameCandidates } from '@/lib/parseGoogleDoc'
import { detectCategory, generateCodeBlock, getDefaultEcommerceJson, type ParamForBlock } from '@/lib/dataLayerDoc'

const bodySchema = z.object({
  url: z.string().min(1),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; projectId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'URL is required' }, { status: 400 })

  const { url } = parsed.data

  // ── Extract Google Doc ID ────────────────────────────────────────────────────
  const docId = extractDocId(url)
  if (!docId) {
    return NextResponse.json(
      { error: 'Could not find a Google Doc ID in that URL. Paste the full URL from your browser.' },
      { status: 400 }
    )
  }

  // ── Get access token ─────────────────────────────────────────────────────────
  const accessToken = await getGoogleAccessToken()
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Not authenticated with Google. Please sign out and sign in again.', noAuth: true },
      { status: 401 }
    )
  }

  // ── Fetch the Google Doc ─────────────────────────────────────────────────────
  let gDoc
  try {
    const gAuth = new google.auth.OAuth2()
    gAuth.setCredentials({ access_token: accessToken })
    const docs = google.docs({ version: 'v1', auth: gAuth })
    const result = await docs.documents.get({ documentId: docId })
    gDoc = result.data
  } catch (err: unknown) {
    const errAny    = err as { status?: number; code?: number; message?: string; response?: { status?: number } }
    const httpStatus = errAny?.status ?? errAny?.response?.status ?? (typeof errAny?.code === 'number' ? errAny.code : 0)

    // Log the full error so we can see the real structure if detection ever fails
    console.error('[datalayer/import] Docs API error status:', httpStatus, 'message:', errAny?.message)

    if (httpStatus === 401 || httpStatus === 403) {
      // 403 can mean either: (a) token lacks documents.readonly scope, or (b) doc not shared
      // We show the re-auth button for both — if it's a sharing issue the user will see
      // the same error after re-authing and can then check document permissions instead.
      return NextResponse.json(
        { error: 'Could not access this document.', noScope: true },
        { status: 403 }
      )
    }
    if (httpStatus === 404) {
      return NextResponse.json(
        { error: 'Google Doc not found. Check the URL and make sure the document exists.' },
        { status: 404 }
      )
    }
    console.error('[datalayer/import] Docs API full error:', err)
    return NextResponse.json({ error: 'Failed to fetch Google Doc.' }, { status: 500 })
  }

  // ── Parse the doc ────────────────────────────────────────────────────────────
  const parsedSections = parseGoogleDoc(gDoc)
  if (parsedSections.length === 0) {
    return NextResponse.json(
      { error: 'No event sections found in the document. Make sure event names are formatted as Heading 2.' },
      { status: 422 }
    )
  }

  // ── Load project events ───────────────────────────────────────────────────────
  const projectEvents = await db.event.findMany({
    where: { projectId },
    select: { id: true, name: true, trigger: true },
  })

  // Build a normalised lookup map: normalisedName → event
  const eventMap = new Map(
    projectEvents.flatMap((e) => normaliseEventNameCandidates(e.name).map((k) => [k, e] as const))
  )

  // ── Upsert DataLayerDoc ───────────────────────────────────────────────────────
  const doc = await db.dataLayerDoc.upsert({
    where:  { projectId },
    create: { projectId },
    update: {},
  })

  // ── Process each parsed section ───────────────────────────────────────────────
  const unmatched: string[] = []
  const created: string[] = []
  let imported = 0

  for (const section of parsedSections) {
    const candidates = normaliseEventNameCandidates(section.eventName)
    let event = candidates.map((c) => eventMap.get(c)).find(Boolean)

    let isNewEvent = false
    let category   = ''
    const linkedParams: ParamForBlock[] = []

    if (!event) {
      // No matching event in the taxonomy — create one so nothing from the
      // doc gets dropped, categorising it from the event name itself.
      isNewEvent = true
      category   = detectCategory(section.eventName)

      const newEvent = await db.event.create({
        data: {
          projectId,
          name:              section.eventName,
          category,
          trigger:           section.trigger,
          requiresDataLayer: true,
        },
        select: { id: true, name: true, trigger: true },
      })
      for (const c of normaliseEventNameCandidates(newEvent.name)) eventMap.set(c, newEvent)
      event = newEvent
      created.push(section.eventName)

      // Register any documented parameters in the project's parameter taxonomy too
      for (const param of section.params) {
        if (!param.name) continue

        let parameter = await db.parameter.findUnique({
          where: { projectId_name: { projectId, name: param.name } },
        })
        if (!parameter) {
          parameter = await db.parameter.create({
            data: { projectId, name: param.name, description: param.notes, example: param.example },
          })
        } else {
          const updates: Record<string, string> = {}
          if (!parameter.description && param.notes)   updates.description = param.notes
          if (!parameter.example && param.example)     updates.example     = param.example
          if (Object.keys(updates).length > 0) {
            parameter = await db.parameter.update({ where: { id: parameter.id }, data: updates })
          }
        }

        await db.eventParameter.upsert({
          where:  { eventId_parameterId: { eventId: event.id, parameterId: parameter.id } },
          update: {},
          create: { eventId: event.id, parameterId: parameter.id },
        })
        linkedParams.push({ name: parameter.name, example: parameter.example, type: parameter.type })
      }
    }

    // Update event trigger if it's currently empty
    if (!event.trigger && section.trigger) {
      await db.event.update({
        where: { id: event.id },
        data:  { trigger: section.trigger },
      })
    }

    // Upsert the DataLayerSection
    const existingSection = await db.dataLayerSection.findUnique({
      where: { eventId: event.id },
    })

    if (existingSection) {
      // Only overwrite code block if we have one and it hasn't been manually edited in the app
      const updates: Record<string, unknown> = {}
      if (section.codeBlock && !existingSection.codeBlockCustomised) {
        updates.codeBlock           = section.codeBlock
        updates.codeBlockCustomised = true
      } else if (section.codeBlock && !existingSection.codeBlock) {
        // Even if customised, fill in if empty
        updates.codeBlock           = section.codeBlock
        updates.codeBlockCustomised = true
      }
      if (Object.keys(updates).length > 0) {
        await db.dataLayerSection.update({ where: { id: existingSection.id }, data: updates })
      }
    } else {
      // Get order from alphabetical position among existing sections
      const sectionCount = await db.dataLayerSection.count({ where: { docId: doc.id } })
      const isEcom        = category.toLowerCase() === 'ecommerce'
      const ecommerceJson = isEcom ? getDefaultEcommerceJson(event.name) : ''
      const codeBlock     = section.codeBlock || (isNewEvent
        ? generateCodeBlock(event.name, linkedParams, { category, ecommerceJson: ecommerceJson || undefined })
        : '')

      await db.dataLayerSection.create({
        data: {
          docId:               doc.id,
          eventId:             event.id,
          order:               sectionCount,
          codeBlock,
          codeBlockCustomised: section.codeBlock !== '',
          ecommerceJson,
        },
      })
    }

    // Upsert param notes
    const sectionRecord = await db.dataLayerSection.findUnique({ where: { eventId: event.id } })
    if (sectionRecord && section.params.length > 0) {
      for (const param of section.params) {
        if (!param.name) continue
        await db.dataLayerParamNote.upsert({
          where:  { sectionId_paramName: { sectionId: sectionRecord.id, paramName: param.name } },
          create: { sectionId: sectionRecord.id, paramName: param.name, example: param.example, notes: param.notes },
          update: {
            // Only overwrite if we have data and the note is currently empty
            ...(param.example ? { example: param.example } : {}),
            ...(param.notes   ? { notes: param.notes }     : {}),
          },
        })
      }
    }

    imported++
  }

  return NextResponse.json({
    found:     parsedSections.length,
    matched:   imported,
    imported,
    created,
    unmatched,
  })
}
