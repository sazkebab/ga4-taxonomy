import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { getGoogleAccessToken } from '@/lib/token'
import { fetchJourneyTransitions, buildJourneyTree } from '@/lib/journeyData'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('startDate') || '30daysAgo'
  const endDate   = searchParams.get('endDate')   || 'yesterday'
  const maxDepth  = Math.min(8, Math.max(1, parseInt(searchParams.get('maxDepth')  || '5', 10)))
  const minUsers  = Math.max(1,             parseInt(searchParams.get('minUsers')  || '10', 10))

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { ga4PropertyId: true },
  })
  if (!project?.ga4PropertyId) {
    return NextResponse.json({ error: 'No GA4 property configured' }, { status: 400 })
  }

  const accessToken = await getGoogleAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'No Google access token' }, { status: 401 })
  }

  const groups = await db.journeyPageGroup.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    select: { name: true, pattern: true, color: true, order: true },
  })

  try {
    const transitions = await fetchJourneyTransitions(
      accessToken, project.ga4PropertyId, startDate, endDate,
    )
    const tree = buildJourneyTree(transitions, groups, maxDepth, minUsers)
    return NextResponse.json({ tree, totalUsers: tree.value ?? 0, groupCount: groups.length })
  } catch (err) {
    console.error('[journey/data]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
