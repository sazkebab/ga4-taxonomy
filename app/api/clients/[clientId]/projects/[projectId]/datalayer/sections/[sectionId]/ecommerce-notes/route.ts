/**
 * PUT /api/.../datalayer/sections/[sectionId]/ecommerce-notes
 *   Body: { fieldPath: string, notes: string }
 *   → Upserts a DataLayerEcommerceNote for the given field path.
 *
 * GET /api/.../datalayer/sections/[sectionId]/ecommerce-notes
 *   → Returns all notes for this section.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

export async function GET(
  _req: NextRequest,
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

  const notes = await db.dataLayerEcommerceNote.findMany({ where: { sectionId } })
  return NextResponse.json(notes)
}

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
  const { fieldPath, notes = '' } = body as { fieldPath?: string; notes?: string }

  if (!fieldPath) return NextResponse.json({ error: 'fieldPath required' }, { status: 400 })

  const note = await db.dataLayerEcommerceNote.upsert({
    where:  { sectionId_fieldPath: { sectionId, fieldPath } },
    create: { sectionId, fieldPath, notes },
    update: { notes },
  })

  return NextResponse.json(note)
}
