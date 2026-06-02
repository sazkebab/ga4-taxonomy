import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireClientAccess } from '@/lib/access'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId } = await params
  try {
    await requireClientAccess(session.user.id, clientId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } })
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(client)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  })
  if (!user?.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { clientId } = await params
  const body = await req.json()
  const parsed = z.object({
    name:       z.string().min(1).optional(),
    isTemplate: z.boolean().optional(),
  }).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const client = await db.client.update({ where: { id: clientId }, data: parsed.data })
  return NextResponse.json(client)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  })
  if (!user?.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { clientId } = await params
  await db.client.delete({ where: { id: clientId } })
  return NextResponse.json({ ok: true })
}
