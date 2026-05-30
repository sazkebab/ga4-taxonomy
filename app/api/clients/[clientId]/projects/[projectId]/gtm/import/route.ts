/**
 * POST /api/clients/[clientId]/projects/[projectId]/gtm/import
 *
 * Imports a list of GA4 events (extracted from a GTM container) into the project.
 * For each event:
 *   1. Upserts the Event record (creates if new; leaves existing events alone).
 *   2. Upserts each Parameter at the project level.
 *   3. Links each Parameter to the Event (skips existing links).
 *
 * Returns { eventsCreated, eventsExisting, parametersCreated, parametersLinked }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const paramSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean']).default('string'),
})

const schema = z.object({
  events: z.array(
    z.object({
      eventName: z.string().min(1),
      trigger: z.string().optional(),
      parameters: z.array(paramSchema),
    })
  ).min(1),
})

export async function POST(
  req: NextRequest,
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

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  let eventsCreated = 0
  let eventsExisting = 0
  let parametersCreated = 0
  let parametersLinked = 0

  for (const eventData of parsed.data.events) {
    // ── 1. Upsert event ──────────────────────────────────────────────────────
    const existingEvent = await db.event.findFirst({
      where: { projectId, name: eventData.eventName },
    })

    let eventId: string
    if (existingEvent) {
      eventId = existingEvent.id
      eventsExisting++
    } else {
      const newEvent = await db.event.create({
        data: {
          name: eventData.eventName,
          trigger: eventData.trigger ?? '',
          projectId,
        },
      })
      eventId = newEvent.id
      eventsCreated++
    }

    // ── 2 & 3. Upsert parameters and link to event ───────────────────────────
    for (const param of eventData.parameters) {
      // Check if the parameter already exists so we can count new ones accurately
      const existingParam = await db.parameter.findUnique({
        where: { projectId_name: { projectId, name: param.name } },
      })

      const parameter = await db.parameter.upsert({
        where: { projectId_name: { projectId, name: param.name } },
        create: { name: param.name, type: param.type, projectId },
        update: {},  // don't overwrite user-edited type on re-import
      })

      if (!existingParam) parametersCreated++

      // Link parameter to event (skip if already linked)
      const existingLink = await db.eventParameter.findUnique({
        where: { eventId_parameterId: { eventId, parameterId: parameter.id } },
      })

      if (!existingLink) {
        await db.eventParameter.create({ data: { eventId, parameterId: parameter.id } })
        parametersLinked++
      }
    }
  }

  return NextResponse.json({ eventsCreated, eventsExisting, parametersCreated, parametersLinked })
}
