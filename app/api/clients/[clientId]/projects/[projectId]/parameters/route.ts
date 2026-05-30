import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  example: z.string().optional(),
  type: z.enum(['string', 'int', 'boolean', 'float']).optional(),
  isGlobal: z.boolean().optional(),
  requiresGA4Registration: z.boolean().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; projectId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const q = req.nextUrl.searchParams.get('q') ?? ''

  const parameters = await db.parameter.findMany({
    where: q ? { projectId, name: { contains: q } } : { projectId },
    orderBy: [{ isGlobal: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { events: true } } },
  })

  return NextResponse.json(parameters)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; projectId: string }> }
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
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const parameter = await db.parameter.create({
    data: {
      projectId,
      name: parsed.data.name,
      description: parsed.data.description ?? '',
      example: parsed.data.example ?? '',
      type: parsed.data.type ?? 'string',
      isGlobal: parsed.data.isGlobal ?? false,
      requiresGA4Registration: parsed.data.requiresGA4Registration ?? false,
    },
  })

  return NextResponse.json(parameter, { status: 201 })
}
