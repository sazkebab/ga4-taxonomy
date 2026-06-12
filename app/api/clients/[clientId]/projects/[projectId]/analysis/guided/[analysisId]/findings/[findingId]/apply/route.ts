import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const schema = z.object({ text: z.string().min(1) })

// Apply an "amend" finding's (possibly user-edited) proposed text back into the
// report, replacing the originally highlighted passage.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; analysisId: string; findingId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, analysisId, findingId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const analysis = await db.guidedAnalysis.findUnique({ where: { id: analysisId } })
  if (!analysis || analysis.projectId !== projectId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const finding = await db.guidedAnalysisFinding.findUnique({ where: { id: findingId } })
  if (!finding || finding.analysisId !== analysisId || finding.action !== 'amend') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body   = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  if (!analysis.reportMarkdown.includes(finding.selection)) {
    return NextResponse.json(
      { error: 'The highlighted text no longer matches the report — it may have already been edited.' },
      { status: 409 },
    )
  }

  const updatedMarkdown = analysis.reportMarkdown.replace(finding.selection, parsed.data.text)

  const [updatedAnalysis, updatedFinding] = await Promise.all([
    db.guidedAnalysis.update({ where: { id: analysisId }, data: { reportMarkdown: updatedMarkdown } }),
    db.guidedAnalysisFinding.update({ where: { id: findingId }, data: { applied: true, proposedText: parsed.data.text } }),
  ])

  return NextResponse.json({ reportMarkdown: updatedAnalysis.reportMarkdown, finding: updatedFinding })
}
