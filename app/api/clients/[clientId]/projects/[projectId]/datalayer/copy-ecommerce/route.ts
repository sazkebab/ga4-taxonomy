/**
 * POST /api/.../datalayer/copy-ecommerce
 *   Body: { sourceSectionId }
 *   → Copies the ecommerceJson from the source section to all other sections in the
 *     same doc where event.category === "ecommerce". Regenerates codeBlock for each.
 *   Returns { updated: number }
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { generateCodeBlock } from '@/lib/dataLayerDoc'

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

  const { sourceSectionId } = await req.json()
  if (!sourceSectionId) return NextResponse.json({ error: 'sourceSectionId required' }, { status: 400 })

  // Load source section
  const source = await db.dataLayerSection.findUnique({
    where: { id: sourceSectionId },
    include: {
      doc:            { select: { id: true } },
      ecommerceNotes: true,
    },
  })
  if (!source) return NextResponse.json({ error: 'Source section not found' }, { status: 404 })

  const ecommerceJson = source.ecommerceJson
  if (!ecommerceJson) return NextResponse.json({ error: 'Source section has no ecommerce data' }, { status: 400 })

  // Find all other ecommerce sections in the same doc
  const targets = await db.dataLayerSection.findMany({
    where: {
      docId: source.doc.id,
      id: { not: sourceSectionId },
      event: { category: 'ecommerce' },
    },
    include: {
      event: {
        select: {
          name: true,
          category: true,
          parameters: {
            include: {
              parameter: { select: { name: true, example: true, type: true } },
            },
          },
        },
      },
    },
  })

  const sourceNotes = source.ecommerceNotes ?? []

  let updated = 0
  for (const target of targets) {
    const params2 = target.event.parameters.map((ep) => ({ ...ep.parameter, value: ep.value ?? 'dynamic' }))
    const codeBlock = generateCodeBlock(target.event.name, params2, {
      category:      target.event.category,
      ecommerceJson: ecommerceJson,
    })
    await db.dataLayerSection.update({
      where: { id: target.id },
      data: { ecommerceJson, codeBlock, codeBlockCustomised: false },
    })

    // Copy ecommerce notes to target
    for (const note of sourceNotes) {
      await db.dataLayerEcommerceNote.upsert({
        where:  { sectionId_fieldPath: { sectionId: target.id, fieldPath: note.fieldPath } },
        create: { sectionId: target.id, fieldPath: note.fieldPath, notes: note.notes },
        update: { notes: note.notes },
      })
    }

    updated++
  }

  return NextResponse.json({ updated })
}
