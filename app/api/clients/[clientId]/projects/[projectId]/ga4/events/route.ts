import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
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
  const propertyId = project?.ga4PropertyId
  if (!propertyId) return NextResponse.json({ error: 'GA4 property ID not configured' }, { status: 400 })

  const accessToken = await getGoogleAccessToken()
  if (!accessToken) return NextResponse.json({ error: 'No Google access token' }, { status: 401 })

  const { dataClient } = getGA4Clients(accessToken)

  const [response] = await dataClient.runReport({
    property: `properties/${propertyId}`,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dateRanges: [{ startDate: '90daysAgo', endDate: 'today' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 250,
  })

  const ga4EventNames = (response.rows ?? []).map(
    (row) => row.dimensionValues?.[0]?.value ?? ''
  )

  const documentedEvents = await db.event.findMany({
    where: { projectId },
    select: { name: true },
  })
  const documentedNames = new Set(documentedEvents.map((e) => e.name))

  const undocumented = ga4EventNames.filter((name) => !documentedNames.has(name))
  const documented = ga4EventNames.filter((name) => documentedNames.has(name))

  return NextResponse.json({ undocumented, documented, total: ga4EventNames.length })
}
