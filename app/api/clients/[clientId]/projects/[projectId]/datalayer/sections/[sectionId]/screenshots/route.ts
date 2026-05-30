/**
 * POST /api/.../datalayer/sections/[sectionId]/screenshots
 *   Body: { filename, dataUrl }
 *   → Store screenshot (base64 data URI). Validates MIME and size (~5 MB max).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const ALLOWED_MIMES = ['data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/gif;base64,', 'data:image/webp;base64,']
const MAX_DATA_URL_LENGTH = 7_000_000 // ~5 MB after base64 overhead

export async function POST(
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
  const { filename, dataUrl, context = 'test' } = body as { filename?: string; dataUrl?: string; context?: string }

  if (!filename || !dataUrl) {
    return NextResponse.json({ error: 'filename and dataUrl required' }, { status: 400 })
  }

  if (!ALLOWED_MIMES.some((prefix) => dataUrl.startsWith(prefix))) {
    return NextResponse.json({ error: 'Only PNG, JPEG, GIF, and WebP images are allowed' }, { status: 400 })
  }

  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    return NextResponse.json({ error: 'Image too large (max ~5 MB)' }, { status: 413 })
  }

  const screenshot = await db.dataLayerScreenshot.create({
    data: { sectionId, filename, dataUrl, context },
  })

  // Return without dataUrl to keep response small
  return NextResponse.json(
    { id: screenshot.id, filename: screenshot.filename, createdAt: screenshot.createdAt },
    { status: 201 }
  )
}
