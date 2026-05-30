import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { getGoogleAccessToken } from '@/lib/token'
import { getGA4Clients } from '@/lib/ga4'
import { requireProjectAccess } from '@/lib/access'

export async function POST(
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
    select: { ga4PropertyId: true, clientId: true },
  })
  const propertyId = project?.ga4PropertyId
  if (!propertyId) return NextResponse.json({ error: 'GA4 property ID not configured' }, { status: 400 })

  const accessToken = await getGoogleAccessToken()
  if (!accessToken) return NextResponse.json({ error: 'No Google access token' }, { status: 401 })

  const { adminClient } = getGA4Clients(accessToken)
  const parent = `properties/${propertyId}`
  const clientId = project.clientId

  const [keyEventsAutoTicked, customDimsAutoTicked] = await Promise.all([
    syncKeyEvents(adminClient, parent, projectId),
    syncCustomDimensions(adminClient, parent, projectId),
  ])

  return NextResponse.json({ keyEventsAutoTicked, customDimsAutoTicked })
}

async function syncKeyEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  parent: string,
  projectId: string
): Promise<number> {
  // Fetch all key events from GA4
  const [ga4KeyEvents] = await adminClient.listKeyEvents({ parent })
  const keyEventSet = new Set<string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ga4KeyEvents ?? []).map((ke: any) => ke.eventName).filter(Boolean)
  )

  // Update ALL events in the project — set isKeyEvent and checkGa4KeyEvent from GA4
  const events = await db.event.findMany({
    where: { projectId },
    select: { id: true, name: true },
  })

  let confirmed = 0
  await Promise.all(
    events.map((event) => {
      const isKey = keyEventSet.has(event.name)
      if (isKey) confirmed++
      return db.event.update({
        where: { id: event.id },
        data: { isKeyEvent: isKey, checkGa4KeyEvent: isKey },
      })
    })
  )
  return confirmed
}

async function syncCustomDimensions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  parent: string,
  projectId: string
): Promise<number> {
  // Fetch both custom dimensions (string params) and custom metrics (numeric params)
  const [dims, metrics] = await Promise.all([
    adminClient.listCustomDimensions({ parent }),
    adminClient.listCustomMetrics({ parent }),
  ])

  const registeredSet = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const dim of dims[0] ?? []) {
    if (dim.parameterName) registeredSet.add(dim.parameterName)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const metric of metrics[0] ?? []) {
    if (metric.parameterName) registeredSet.add(metric.parameterName)
  }

  // Update ALL parameters in the project — regardless of requiresGA4Registration flag
  const parameters = await db.parameter.findMany({
    where: { projectId },
    select: { id: true, name: true },
  })

  let registered = 0
  await Promise.all(
    parameters.map((param) => {
      const isRegistered = registeredSet.has(param.name)
      if (isRegistered) registered++
      return db.parameter.update({
        where: { id: param.id },
        data: {
          ga4Registered: isRegistered,
          // If found in GA4, mark it as requiring GA4 registration too
          ...(isRegistered && { requiresGA4Registration: true }),
        },
      })
    })
  )
  return registered
}
