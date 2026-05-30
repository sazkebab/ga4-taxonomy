/**
 * POST /api/.../datalayer/export/googledoc
 * → Create a Google Doc from the project's DataLayer documentation; return { url }
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { getGoogleAccessToken } from '@/lib/token'
import { requireProjectAccess } from '@/lib/access'
import { createGoogleDoc } from '@/lib/exportGoogleDoc'
import type { ExportDoc, ExportSection, ExportParam } from '@/lib/exportDocx'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string; projectId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, projectId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const accessToken = await getGoogleAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'No Google access token. Sign out and back in.' }, { status: 401 })
  }

  const [project, client] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    db.client.findUnique({ where: { id: clientId },  select: { name: true } }),
  ])
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const doc = await db.dataLayerDoc.findUnique({
    where: { projectId },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: {
          event: {
            include: {
              parameters: {
                include: {
                  parameter: {
                    select: { name: true, description: true, type: true, example: true },
                  },
                },
              },
            },
          },
          comments:       { orderBy: { createdAt: 'asc' } },
          paramNotes:     true,
          ecommerceNotes: true,
        },
      },
    },
  })

  if (!doc) return NextResponse.json({ error: 'No documentation generated yet' }, { status: 404 })

  const sections: ExportSection[] = doc.sections.map((s) => {
    const noteMap = new Map(s.paramNotes.map((n) => [n.paramName, n]))
    const exportParams: ExportParam[] = s.event.parameters.map((ep) => {
      const note = noteMap.get(ep.parameter.name)
      return {
        name:        ep.parameter.name,
        description: ep.parameter.description,
        type:        ep.parameter.type,
        value:       ep.value ?? 'dynamic',
        example:     note?.example || ep.parameter.example || '',
        notes:       note?.notes || '',
      }
    })
    return {
      eventName:      s.event.name,
      category:       s.event.category ?? '',
      trigger:        s.event.trigger,
      codeBlock:      s.codeBlock,
      params:         exportParams,
      ecommerceNotes: s.ecommerceNotes.map((n) => ({ fieldPath: n.fieldPath, notes: n.notes })),
      comments:       s.comments.map((c) => c.body),
      isDone:         s.isDone,
      isTested:       s.isTested,
      testResult:     s.testResult,
    }
  })

  const exportData: ExportDoc = {
    projectName: project.name,
    clientName:  client?.name ?? project.name,
    sections,
  }

  try {
    const url = await createGoogleDoc(accessToken, exportData)
    return NextResponse.json({ url })
  } catch (e) {
    console.error('Google Doc export failed:', e)
    return NextResponse.json({ error: 'Failed to create Google Doc. Check Google Drive permissions.' }, { status: 502 })
  }
}
