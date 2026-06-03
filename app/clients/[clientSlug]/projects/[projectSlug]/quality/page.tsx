import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { resolveProject } from '@/lib/resolve-route'
import QualityClient from './QualityClient'

export default async function QualityPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string; projectSlug: string }>
  searchParams: Promise<{ tab?: string; report?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) notFound()

  const { clientSlug, projectSlug } = await params
  const { tab, report: reportId } = await searchParams
  const { project, apiBase } = await resolveProject(clientSlug, projectSlug, session.user.id)

  const [reports, suppressions, prompts] = await Promise.all([
    db.dataQualityReport.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, weekStart: true, createdAt: true, completedAt: true },
      take: 20,
    }),
    db.dataQualitySuppression.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
    }),
    db.dataQualityPrompt.findMany({
      where: { projectId: project.id },
      orderBy: { order: 'asc' },
    }),
  ])

  // Load full report if one is selected
  const currentReport = reportId
    ? await db.dataQualityReport.findUnique({
        where: { id: reportId },
        include: { findings: { orderBy: { createdAt: 'asc' } } },
      })
    : (reports[0]
        ? await db.dataQualityReport.findUnique({
            where: { id: reports[0].id },
            include: { findings: { orderBy: { createdAt: 'asc' } } },
          })
        : null)

  const hasGa4 = !!project.ga4PropertyId

  return (
    <QualityClient
      projectId={project.id}
      apiBase={apiBase}
      reports={reports}
      currentReport={currentReport}
      suppressions={suppressions}
      prompts={prompts}
      initialTab={(tab === 'settings' ? 'settings' : 'report') as 'report' | 'settings'}
      hasGa4={hasGa4}
    />
  )
}
