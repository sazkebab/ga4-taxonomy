import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireProjectAccess } from '@/lib/access'
import { getGoogleAccessToken } from '@/lib/token'
import { runQualityMonitor } from '@/lib/qualityMonitorAgent'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId, reportId } = await params
  try { await requireProjectAccess(session.user.id, projectId) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const report = await db.dataQualityReport.findUnique({ where: { id: reportId } })
  if (!report || report.projectId !== projectId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (report.status === 'running') return NextResponse.json({ status: 'running' })

  // The Google access token depends on the request-scoped session (`auth()`),
  // so it must be resolved here — before we hand off to the detached
  // background task below, which keeps running after this response is sent.
  const accessToken = await getGoogleAccessToken()
  if (!accessToken) {
    const message = 'No Google access token — please sign out and sign back in.'
    await db.dataQualityReport.update({
      where: { id: reportId },
      data: { status: 'error', reportMarkdown: `⚠️ ${message}` },
    })
    return NextResponse.json({ error: message }, { status: 401 })
  }

  await db.dataQualityReport.update({
    where: { id: reportId },
    data: { status: 'running', reportMarkdown: '', progressLog: '[]' },
  })

  // Run in the background — keeps going even if the client closes the tab,
  // navigates away, or refreshes. The frontend polls GET .../reports/[id] for
  // progress (reportMarkdown / progressLog) and final status.
  void runQualityMonitor(reportId, projectId, accessToken).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err)
    await db.dataQualityReport.update({
      where: { id: reportId },
      data: { status: 'error', reportMarkdown: `⚠️ Monitor failed: ${message}` },
    }).catch(() => {})
  })

  return NextResponse.json({ status: 'running' })
}
