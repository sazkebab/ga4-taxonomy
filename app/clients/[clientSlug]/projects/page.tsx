import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { requireClientAccess } from '@/lib/access'
import { Card, CardContent } from '@/components/ui/card'
import NewProjectForm from './NewProjectForm'

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>
}) {
  const session = await auth()
  const { clientSlug } = await params

  if (!session?.user?.id) notFound()

  const client = await db.client.findUnique({ where: { slug: clientSlug } })
  if (!client) notFound()

  try {
    await requireClientAccess(session.user.id, client.id)
  } catch {
    notFound()
  }

  const projects = await db.project.findMany({
    where: { clientId: client.id },
    orderBy: { name: 'asc' },
    include: { _count: { select: { events: true } } },
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-2">
        <Link href="/clients" className="text-sm text-muted-foreground hover:underline">
          ← Clients
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6 mt-2">
        <div>
          <h2 className="text-2xl font-semibold">{client.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <NewProjectForm apiUrl={`/api/clients/${client.id}/projects`} />
      </div>

      {projects.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No projects yet</p>
          <p className="text-sm mt-1">Ask an admin to create a project for this client.</p>
        </div>
      )}

      <div className="grid gap-3">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/clients/${clientSlug}/projects/${project.slug}/events`}
            className="block"
          >
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="font-medium">{project.name}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {project._count.events} event{project._count.events !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">→</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
