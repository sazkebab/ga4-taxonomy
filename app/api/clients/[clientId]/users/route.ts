import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'

async function isSuperAdmin(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } })
  return user?.isSuperAdmin ?? false
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isSuperAdmin(session.user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { clientId } = await params
  const assignments = await db.clientUser.findMany({
    where: { clientId },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  })
  return NextResponse.json(assignments.map((a) => a.user))
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isSuperAdmin(session.user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { clientId } = await params
  const body = await req.json()
  const parsed = z.union([
    z.object({ userId: z.string() }),
    z.object({ email: z.string().email() }),
  ]).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  let userId: string
  if ('email' in parsed.data) {
    const existing = await db.user.findUnique({ where: { email: parsed.data.email } })
    const user = existing ?? await db.user.create({ data: { email: parsed.data.email } })
    userId = user.id
  } else {
    userId = parsed.data.userId
  }

  await db.clientUser.upsert({
    where: { clientId_userId: { clientId, userId } },
    update: {},
    create: { clientId, userId },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isSuperAdmin(session.user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { clientId } = await params
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  await db.clientUser.delete({ where: { clientId_userId: { clientId, userId } } })
  return NextResponse.json({ ok: true })
}
