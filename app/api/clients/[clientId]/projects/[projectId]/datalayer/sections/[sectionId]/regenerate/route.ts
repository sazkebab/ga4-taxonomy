/**
 * POST /api/.../datalayer/sections/[sectionId]/regenerate
 *   → Re-generates codeBlock from live event+params; clears codeBlockCustomised
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { generateCodeBlock } from '@/lib/dataLayerDoc'

export async function POST(
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

  const section = await db.dataLayerSection.findUnique({
    where: { id: sectionId },
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

  if (!section) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const params2 = section.event.parameters.map((ep) => ({ ...ep.parameter, value: ep.value ?? 'dynamic' }))
  const codeBlock = generateCodeBlock(section.event.name, params2, {
    category:      section.event.category ?? '',
    ecommerceJson: section.ecommerceJson || undefined,
  })

  const updated = await db.dataLayerSection.update({
    where: { id: sectionId },
    data: { codeBlock, codeBlockCustomised: false },
  })

  return NextResponse.json(updated)
}
