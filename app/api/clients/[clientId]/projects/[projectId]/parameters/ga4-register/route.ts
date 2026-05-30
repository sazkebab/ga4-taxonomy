/**
 * POST /api/clients/[clientId]/projects/[projectId]/parameters/ga4-register
 *
 * 1. Lists existing custom dimensions in the project's GA4 property.
 * 2. Marks already-registered params as ga4Registered = true.
 * 3. Creates custom dimensions for params that need registration but aren't there yet.
 * 4. Returns { checked, alreadyRegistered, newlyRegistered, errors }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { getGoogleAccessToken } from '@/lib/token'
import { getGA4Clients } from '@/lib/ga4'
import { requireProjectAccess } from '@/lib/access'

export async function POST(
  _req: NextRequest,
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

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { ga4PropertyId: true },
  })
  if (!project?.ga4PropertyId) {
    return NextResponse.json(
      { error: 'GA4 property ID is not configured for this project. Set it on the GA4 page.' },
      { status: 400 }
    )
  }

  const accessToken = await getGoogleAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'No Google access token. Sign out and back in.' }, { status: 401 })
  }

  const { adminClient } = getGA4Clients(accessToken)
  const parent = `properties/${project.ga4PropertyId}`

  // --- Fetch all existing custom dimensions from GA4 ---
  const existingDimNames = new Set<string>()
  try {
    const [dims] = await adminClient.listCustomDimensions({ parent })
    for (const d of dims ?? []) {
      if (d.parameterName) existingDimNames.add(d.parameterName)
    }
  } catch {
    return NextResponse.json({ error: 'Failed to list GA4 custom dimensions' }, { status: 502 })
  }

  // --- Get all params that need registration ---
  const pending = await db.parameter.findMany({
    where: { projectId, requiresGA4Registration: true },
    select: { id: true, name: true, description: true, ga4Registered: true },
  })

  let alreadyRegistered = 0
  let newlyRegistered = 0
  const errors: string[] = []

  for (const param of pending) {
    if (existingDimNames.has(param.name)) {
      // Already in GA4 — mark as registered (and required) if not already
      if (!param.ga4Registered) {
        await db.parameter.update({
          where: { id: param.id },
          data: { ga4Registered: true, requiresGA4Registration: true },
        })
      }
      alreadyRegistered++
    } else if (!param.ga4Registered) {
      // Not in GA4 yet — create the custom dimension
      try {
        await adminClient.createCustomDimension({
          parent,
          customDimension: {
            parameterName: param.name,
            displayName: param.name.replace(/_/g, ' '),
            scope: 'EVENT',
            description: param.description || '',
          },
        })
        await db.parameter.update({
          where: { id: param.id },
          data: { ga4Registered: true, requiresGA4Registration: true },
        })
        newlyRegistered++
      } catch (e) {
        errors.push(`${param.name}: ${(e as Error).message}`)
      }
    }
  }

  return NextResponse.json({
    checked: pending.length,
    alreadyRegistered,
    newlyRegistered,
    errors,
  })
}
