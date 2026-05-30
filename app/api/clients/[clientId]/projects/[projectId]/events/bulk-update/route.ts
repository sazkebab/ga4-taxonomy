/**
 * POST /api/clients/[clientId]/projects/[projectId]/events/bulk-update
 *
 * Updates stage OR category for a set of events.
 * Body: { ids: string[], stage: StageKey }
 *    or { ids: string[], category: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const STAGE_FIELDS = {
  not_started: { checkDataLayerDoc: false, checkDocumented: false, checkGtmSetUp: false, checkGtmPasses: false },
  dl_doc:      { checkDataLayerDoc: true,  checkDocumented: false, checkGtmSetUp: false, checkGtmPasses: false },
  dl_impl:     { checkDataLayerDoc: true,  checkDocumented: true,  checkGtmSetUp: false, checkGtmPasses: false },
  gtm:         { checkDataLayerDoc: true,  checkDocumented: true,  checkGtmSetUp: true,  checkGtmPasses: false },
  passed:      { checkDataLayerDoc: true,  checkDocumented: true,  checkGtmSetUp: true,  checkGtmPasses: true  },
}

const schema = z.object({
  ids:      z.array(z.string()).min(1),
  stage:    z.enum(['not_started', 'dl_doc', 'dl_impl', 'gtm', 'passed']).optional(),
  category: z.string().optional(),
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

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { ids, stage, category } = parsed.data

  if (stage === undefined && category === undefined) {
    return NextResponse.json({ error: 'Provide either stage or category' }, { status: 400 })
  }

  const data = stage !== undefined
    ? STAGE_FIELDS[stage]
    : { category: category! }

  const { count } = await db.event.updateMany({
    where: { id: { in: ids }, projectId },   // scoped to project for safety
    data,
  })

  return NextResponse.json({ ok: true, updated: count })
}
