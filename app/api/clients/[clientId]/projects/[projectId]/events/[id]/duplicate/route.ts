/**
 * POST /api/clients/[clientId]/projects/[projectId]/events/[id]/duplicate
 *
 * Duplicates an event and all its parameter links into the same project.
 * The copy gets a unique name by appending " copy" (then " copy 2", etc.).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, id } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const source = await db.event.findUnique({
    where: { id, projectId },
    include: { parameters: { select: { parameterId: true } } },
  })
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Find a unique name: "event copy", "event copy 2", …
  let newName = `${source.name} copy`
  let counter = 2
  while (await db.event.findFirst({ where: { projectId, name: newName } })) {
    newName = `${source.name} copy ${counter++}`
  }

  const copy = await db.event.create({
    data: {
      name:              newName,
      projectId,
      trigger:           source.trigger,
      requiresDataLayer: source.requiresDataLayer,
      isKeyEvent:        source.isKeyEvent,
      // checklist fields start fresh
      parameters: {
        create: source.parameters.map((ep) => ({ parameterId: ep.parameterId })),
      },
    },
  })

  return NextResponse.json({ id: copy.id, name: copy.name })
}
