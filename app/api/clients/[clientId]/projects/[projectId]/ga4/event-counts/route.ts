/**
 * GET /api/clients/[clientId]/projects/[projectId]/ga4/event-counts
 *
 * Fetches event fire counts for the last 90 days from GA4 Data API,
 * saves them back to each Event record, and returns the counts map.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { getGoogleAccessToken } from '@/lib/token'
import { getGA4Clients } from '@/lib/ga4'
import { requireProjectAccess } from '@/lib/access'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { ga4PropertyId: true },
  })
  if (!project?.ga4PropertyId) {
    return NextResponse.json({ error: 'GA4 property ID not configured' }, { status: 400 })
  }

  const accessToken = await getGoogleAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'No Google access token — sign out and back in' }, { status: 401 })
  }

  const { dataClient, adminClient } = getGA4Clients(accessToken)
  const propertyPath = `properties/${project.ga4PropertyId}`

  // ── 1. Fetch event fire counts (Data API) ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = []
  try {
    const [response] = await dataClient.runReport({
      property:   propertyPath,
      dimensions: [{ name: 'eventName' }],
      metrics:    [{ name: 'eventCount' }],
      dateRanges: [{ startDate: '90daysAgo', endDate: 'today' }],
      limit: 10000,
    })
    rows = response.rows ?? []
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `GA4 API error: ${msg}` },
      { status: 502 }
    )
  }

  // Build name → count map from GA4 response
  const ga4Counts: Record<string, number> = {}
  for (const row of rows) {
    const name  = (row.dimensionValues?.[0]?.value as string) ?? ''
    const count = parseInt((row.metricValues?.[0]?.value as string) ?? '0', 10)
    if (name) ga4Counts[name] = count
  }

  // ── 2. Fetch key events (Admin API) ────────────────────────────────────────
  const ga4KeyEventNames = new Set<string>()
  try {
    const [keyEvents] = await adminClient.listKeyEvents({ parent: propertyPath })
    for (const ke of keyEvents) {
      if (ke.eventName) ga4KeyEventNames.add(ke.eventName)
    }
  } catch (err) {
    // Non-fatal: key event fetch failure won't block the count sync
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[ga4/event-counts] Key event fetch failed (continuing):', msg)
  }

  // ── 3. Save counts + key event status back to every event in this project ──
  const events = await db.event.findMany({
    where: { projectId },
    select: { id: true, name: true },
  })

  const checkedAt = new Date()
  try {
    await Promise.all(
      events.map((e) =>
        db.event.update({
          where: { id: e.id },
          data: {
            ga4FireCount: ga4Counts[e.name] ?? 0,
            ga4CheckedAt: checkedAt,
            isKeyEvent:   ga4KeyEventNames.has(e.name),
          },
        })
      )
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ga4/event-counts] DB save failed:', msg)
    return NextResponse.json(
      { error: `Failed to save GA4 counts: ${msg}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ counts: ga4Counts, keyEvents: [...ga4KeyEventNames] })
}
