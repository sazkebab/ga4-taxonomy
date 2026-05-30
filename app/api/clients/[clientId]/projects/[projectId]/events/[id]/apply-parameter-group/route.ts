/**
 * POST /api/clients/[clientId]/projects/[projectId]/events/[id]/apply-parameter-group
 *
 * Applies a predefined parameter group to an event:
 *   1. Upserts each parameter at the project level (creates if not present, leaves it alone if it exists).
 *   2. Attaches each parameter to the event (skips if already attached).
 *
 * Returns { added, alreadyAttached, parameters: [{ name, created, attached }] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { PARAMETER_GROUPS_BY_KEY } from '@/lib/parameterGroups'

const schema = z.object({ group: z.string() })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, id: eventId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const group = PARAMETER_GROUPS_BY_KEY[parsed.data.group]
  if (!group) return NextResponse.json({ error: `Unknown group: ${parsed.data.group}` }, { status: 400 })

  // Verify the event belongs to this project
  const event = await db.event.findUnique({ where: { id: eventId }, select: { projectId: true } })
  if (!event || event.projectId !== projectId) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  let added = 0
  let alreadyAttached = 0
  const results: { name: string; created: boolean; attached: boolean }[] = []

  for (const paramDef of group.parameters) {
    // 1. Upsert the parameter at project level
    const parameter = await db.parameter.upsert({
      where: { projectId_name: { projectId, name: paramDef.name } },
      create: {
        name: paramDef.name,
        type: paramDef.type,
        description: paramDef.description,
        requiresGA4Registration: paramDef.requiresGA4Registration,
        projectId,
      },
      update: {}, // Don't overwrite if the user has customised it
    })

    // 2. Attach to the event (skip if already linked)
    const existing = await db.eventParameter.findUnique({
      where: { eventId_parameterId: { eventId, parameterId: parameter.id } },
    })

    if (existing) {
      alreadyAttached++
      results.push({ name: paramDef.name, created: false, attached: false })
    } else {
      await db.eventParameter.create({ data: { eventId, parameterId: parameter.id } })
      added++
      results.push({ name: paramDef.name, created: true, attached: true })
    }
  }

  return NextResponse.json({ added, alreadyAttached, parameters: results })
}
