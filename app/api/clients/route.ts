import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { slugify } from '@/lib/slug'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const user = await db.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } })

  const clients = user?.isSuperAdmin
    ? await db.client.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { projects: true, users: true } },
        },
      })
    : await db.client.findMany({
        where: { users: { some: { userId } } },
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { projects: true, users: true } },
        },
      })

  return NextResponse.json(clients)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  })
  if (!user?.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = z.object({ name: z.string().min(1) }).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const client = await db.client.create({ data: { name: parsed.data.name, slug: slugify(parsed.data.name) } })
  return NextResponse.json(client, { status: 201 })
}
