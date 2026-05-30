/**
 * GET    /api/.../screenshots/[screenshotId]  → serve the full dataUrl
 * DELETE /api/.../screenshots/[screenshotId]  → delete screenshot
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; sectionId: string; screenshotId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, screenshotId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const screenshot = await db.dataLayerScreenshot.findUnique({
    where: { id: screenshotId },
  })
  if (!screenshot) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(screenshot)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; sectionId: string; screenshotId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, screenshotId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.dataLayerScreenshot.delete({ where: { id: screenshotId } })
  return new NextResponse(null, { status: 204 })
}
