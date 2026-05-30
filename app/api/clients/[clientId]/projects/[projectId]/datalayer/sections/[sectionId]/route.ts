/**
 * PATCH  /api/.../datalayer/sections/[sectionId]
 *   Body: { codeBlock?, isDone?, isTested?, testResult?, ecommerceJson? }
 *   → When ecommerceJson is provided and codeBlockCustomised=false, also regenerates codeBlock.
 *   → When codeBlock is provided, sets codeBlockCustomised=true.
 *
 * DELETE /api/.../datalayer/sections/[sectionId]
 *   → Removes the section (and its comments, screenshots, paramNotes via cascade).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { generateCodeBlock } from '@/lib/dataLayerDoc'

export async function PATCH(
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
  const { codeBlock, isDone, isTested, testResult, ecommerceJson, order, testUrl } = body as {
    codeBlock?:     string
    isDone?:        boolean
    isTested?:      boolean
    testResult?:    string | null
    ecommerceJson?: string
    order?:         number
    testUrl?:       string
  }

  // Fetch section + event so we can regenerate if needed
  const section = await db.dataLayerSection.findUnique({
    where: { id: sectionId },
    include: {
      event: {
        include: {
          parameters: {
            include: {
              parameter: { select: { name: true, example: true, type: true } },
            },
          },
        },
      },
    },
  })
  if (!section) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}

  if (codeBlock !== undefined) {
    data.codeBlock = codeBlock
    data.codeBlockCustomised = true
  }
  if (isDone      !== undefined) data.isDone      = isDone
  if (isTested    !== undefined) data.isTested    = isTested
  if (testResult  !== undefined) data.testResult  = testResult
  if (order       !== undefined) data.order       = order
  if (testUrl     !== undefined) data.testUrl     = testUrl

  if (ecommerceJson !== undefined) {
    data.ecommerceJson = ecommerceJson
    // Regenerate codeBlock unless manually customised
    if (!section.codeBlockCustomised) {
      const params2 = section.event.parameters.map((ep) => ({ ...ep.parameter, value: ep.value ?? 'dynamic' }))
      data.codeBlock = generateCodeBlock(section.event.name, params2, {
        category:      section.event.category ?? '',
        ecommerceJson: ecommerceJson || undefined,
      })
    }
  }

  const updated = await db.dataLayerSection.update({
    where: { id: sectionId },
    data,
  })

  return NextResponse.json(updated)
}

export async function DELETE(
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

  await db.dataLayerSection.delete({ where: { id: sectionId } })
  return new NextResponse(null, { status: 204 })
}
