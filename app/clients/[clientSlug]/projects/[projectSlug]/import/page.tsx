import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { resolveProject } from '@/lib/resolve-route'
import ImportClient from './ImportClient'

export default async function ImportPage({
  params,
}: {
  params: Promise<{ clientSlug: string; projectSlug: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) notFound()

  const { clientSlug, projectSlug } = await params
  const { project, base, apiBase } = await resolveProject(clientSlug, projectSlug, session.user.id)

  return (
    <ImportClient
      clientId={project.clientId}
      projectId={project.id}
      base={base}
      apiBase={apiBase}
    />
  )
}
