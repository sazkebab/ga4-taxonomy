import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { resolveProject } from '@/lib/resolve-route'
import JourneyClient from './JourneyClient'

export default async function JourneyPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string; projectSlug: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) notFound()

  const { clientSlug, projectSlug } = await params
  const { tab } = await searchParams
  const { project, apiBase } = await resolveProject(clientSlug, projectSlug, session.user.id)

  const groups = await db.journeyPageGroup.findMany({
    where:   { projectId: project.id },
    orderBy: { order: 'asc' },
  })

  const projectDetail = await db.project.findUnique({
    where: { id: project.id },
    select: { bqJourneyTable: true },
  })

  return (
    <JourneyClient
      projectId={project.id}
      apiBase={apiBase}
      initialGroups={groups}
      initialTab={(tab === 'settings' ? 'settings' : 'map') as 'map' | 'settings'}
      bqJourneyTable={projectDetail?.bqJourneyTable ?? ''}
    />
  )
}
