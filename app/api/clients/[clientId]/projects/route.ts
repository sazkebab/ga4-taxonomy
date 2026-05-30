import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireClientAccess } from '@/lib/access'
import { slugify } from '@/lib/slug'

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

  const projects = await db.project.findMany({
    where: { clientId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { events: true } } },
  })

  return NextResponse.json(projects)
}

export async function POST(
  req: NextRequest,
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

  const body = await req.json()
  const parsed = z.object({ name: z.string().min(1) }).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const project = await db.project.create({ data: { name: parsed.data.name, slug: slugify(parsed.data.name), clientId } })
  return NextResponse.json(project, { status: 201 })
}
