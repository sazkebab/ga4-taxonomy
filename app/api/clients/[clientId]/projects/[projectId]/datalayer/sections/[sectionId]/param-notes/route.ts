/**
 * PUT /api/.../datalayer/sections/[sectionId]/param-notes
 *   Body: { paramName, example?, notes? }
 *   → Upsert per-section parameter notes
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; sectionId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, sectionId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { paramName, example, notes } = body as {
    paramName: string
    example?: string
    notes?: string
  }

  if (!paramName) return NextResponse.json({ error: 'paramName required' }, { status: 400 })

  const paramNote = await db.dataLayerParamNote.upsert({
    where: { sectionId_paramName: { sectionId, paramName } },
    create: {
      sectionId,
      paramName,
      example: example ?? '',
      notes: notes ?? '',
    },
    update: {
      ...(example !== undefined && { example }),
      ...(notes !== undefined && { notes }),
    },
  })

  return NextResponse.json(paramNote)
}
