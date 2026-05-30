import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { resolveProject } from '@/lib/resolve-route'
import NewEventForm from './NewEventForm'

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ clientSlug: string; projectSlug: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) notFound()

  const { clientSlug, projectSlug } = await params
  const { project, base, apiBase } = await resolveProject(clientSlug, projectSlug, session.user.id)

  const categoryRows = await db.event.findMany({
    where:    { projectId: project.id, NOT: { category: '' } },
    select:   { category: true },
    distinct: ['category'],
    orderBy:  { category: 'asc' },
  })
  const categories = categoryRows.map((r) => r.category)

  return (
    <NewEventForm
      clientId={project.clientId}
      projectId={project.id}
      base={base}
      apiBase={apiBase}
      categories={categories}
    />
  )
}
