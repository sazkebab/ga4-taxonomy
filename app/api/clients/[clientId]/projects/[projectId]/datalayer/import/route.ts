/**
 * POST /api/clients/[clientId]/projects/[projectId]/datalayer/import
 * Body: { url: string }
 *
 * Fetches a Google Doc by URL, parses its dataLayer documentation structure,
 * and upserts DataLayerSections + DataLayerParamNotes for matched events.
 *
 * Returns:
 *   { matched: number, imported: number, unmatched: string[], noScope: boolean }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { google } from 'googleapis'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { getGoogleAccessToken } from '@/lib/token'
import { parseGoogleDoc, extractDocId, normaliseEventName } from '@/lib/parseGoogleDoc'

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
    const errAny = err as {
      status?: number
      code?: number
      message?: string
      errors?: { reason?: string }[]
      response?: { data?: { error?: { errors?: { reason?: string }[]; message?: string } } }
    }
    const httpStatus = errAny?.status ?? errAny?.code ?? 0
    // Check for insufficient scope specifically (vs. "doc not shared with this account")
    const errorsArr = errAny?.errors ?? errAny?.response?.data?.error?.errors ?? []
    const reason    = (errorsArr[0]?.reason ?? '').toLowerCase()
    const message   = (errAny?.message ?? errAny?.response?.data?.error?.message ?? '').toLowerCase()
    const isScope   = reason === 'insufficientpermissions' || message.includes('insufficient') || message.includes('scope')

    if (httpStatus === 401 || (httpStatus === 403 && isScope)) {
      return NextResponse.json(
        {
          error: 'Google Docs access not authorised. Click "Re-authorise Google" to grant document access.',
          noScope: true,
        },
        { status: 403 }
      )
    }
    if (httpStatus === 403) {
      return NextResponse.json(
        { error: "You don't have access to this document. Make sure it's shared with the Google account you signed in with." },
        { status: 403 }
      )
    }
    if (httpStatus === 404) {
      return NextResponse.json(
        { error: 'Google Doc not found. Check the URL and make sure the document exists.' },
        { status: 404 }
      )
    }
    console.error('[datalayer/import] Docs API error:', err)
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
    projectEvents.map((e) => [normaliseEventName(e.name), e])
  )

  // ── Upsert DataLayerDoc ───────────────────────────────────────────────────────
  const doc = await db.dataLayerDoc.upsert({
    where:  { projectId },
    create: { projectId },
    update: {},
  })

  // ── Process each parsed section ───────────────────────────────────────────────
  const unmatched: string[] = []
  let imported = 0

  for (const section of parsedSections) {
    const normName = normaliseEventName(section.eventName)
    const event    = eventMap.get(normName)

    if (!event) {
      unmatched.push(section.eventName)
      continue
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
      await db.dataLayerSection.create({
        data: {
          docId:               doc.id,
          eventId:             event.id,
          order:               sectionCount,
          codeBlock:           section.codeBlock,
          codeBlockCustomised: section.codeBlock !== '',
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
    unmatched,
  })
}
