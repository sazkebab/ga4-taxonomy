import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'

const patchSchema = z.object({
  coreQuestion:         z.string().optional(),
  useCase:              z.string().optional(),
  stakeholderName:      z.string().optional(),
  stakeholderLiteracy:  z.string().optional(),
  keyKpis:              z.array(z.string()).optional(),
  insightDestination:   z.string().optional(),
  preferredOutputStyle: z.string().optional(),
  priorKnowledge:       z.string().optional(),
  subQuestions:         z.array(z.string()).optional(),
  hypotheses:           z.array(z.object({ question: z.string(), hypothesis: z.string() })).optional(),
})

async function getVerified(analysisId: string, projectId: string, userId: string) {
  await requireProjectAccess(userId, projectId)
  const analysis = await db.guidedAnalysis.findUnique({ where: { id: analysisId } })
  if (!analysis || analysis.projectId !== projectId) return null
  return analysis
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; analysisId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, analysisId } = await params
  try {
    const analysis = await getVerified(analysisId, projectId, session.user.id)
    if (!analysis) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(analysis)
  } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; analysisId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, analysisId } = await params
  try {
    const analysis = await getVerified(analysisId, projectId, session.user.id)
    if (!analysis) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { keyKpis, subQuestions, hypotheses, ...rest } = parsed.data
    const updated = await db.guidedAnalysis.update({
      where: { id: analysisId },
      data: {
        ...rest,
        ...(keyKpis     !== undefined ? { keyKpis:     JSON.stringify(keyKpis) }     : {}),
        ...(subQuestions!== undefined ? { subQuestions: JSON.stringify(subQuestions) } : {}),
        ...(hypotheses  !== undefined ? { hypotheses:  JSON.stringify(hypotheses) }  : {}),
      },
    })
    return NextResponse.json(updated)
  } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; analysisId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, analysisId } = await params
  try {
    await getVerified(analysisId, projectId, session.user.id)
    await db.guidedAnalysis.deleteMany({ where: { id: analysisId, projectId } })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
}
