import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const CHECKLIST_FIELDS = [
  'checkDocumented',
  'checkDataLayerDoc',
  'checkGtmSetUp',
  'checkGtmPasses',
  'checkGa4KeyEvent',
] as const

type ChecklistField = (typeof CHECKLIST_FIELDS)[number]

const schema = z.object({
  field: z.enum(CHECKLIST_FIELDS),
  value: z.boolean(),
})

export async function POST(
  req: NextRequest,
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

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const field = parsed.data.field as ChecklistField
  const event = await db.event.update({
    where: { id },
    data: { [field]: parsed.data.value },
  })

  return NextResponse.json(event)
}
