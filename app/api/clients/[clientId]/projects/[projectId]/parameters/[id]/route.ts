import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  example: z.string().optional(),
  type: z.enum(['string', 'int', 'boolean', 'float']).optional(),
  isGlobal: z.boolean().optional(),
  requiresGA4Registration: z.boolean().optional(),
  ga4Registered: z.boolean().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; projectId: string; id: string }> }
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
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const parameter = await db.parameter.update({ where: { id }, data: parsed.data })
  return NextResponse.json(parameter)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string; projectId: string; id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, id } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.parameter.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
