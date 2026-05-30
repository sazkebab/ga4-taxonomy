/**
 * GET /api/.../datalayer/export/docx
 * → Stream a branded .docx of the project's DataLayer documentation
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { buildDocx } from '@/lib/exportDocx'
import type { ExportDoc, ExportSection, ExportParam, ExportEcommerceNote } from '@/lib/exportDocx'

export async function GET(
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

    const exportEcommerceNotes: ExportEcommerceNote[] = s.ecommerceNotes.map((n) => ({
      fieldPath: n.fieldPath,
      notes:     n.notes,
    }))

    return {
      eventName:      s.event.name,
      category:       s.event.category ?? '',
      trigger:        s.event.trigger,
      codeBlock:      s.codeBlock,
      params:         exportParams,
      ecommerceNotes: exportEcommerceNotes,
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
  const buffer = await buildDocx(exportData)

  const filename = `${(client?.name ?? project.name).replace(/[^a-z0-9]/gi, '_')}_datalayer_docs.docx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
