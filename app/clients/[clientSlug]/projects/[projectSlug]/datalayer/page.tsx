import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { resolveProject } from '@/lib/resolve-route'
import DataLayerPageClient from './DataLayerPageClient'

export default async function DataLayerPage({
  params,
}: {
  params: Promise<{ clientSlug: string; projectSlug: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) notFound()

  const { clientSlug, projectSlug } = await params
  const { project, base, apiBase } = await resolveProject(clientSlug, projectSlug, session.user.id)

  // Load full doc with event parameters and category
  const doc = await db.dataLayerDoc.findUnique({
    where: { projectId: project.id },
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
          comments:    { orderBy: { createdAt: 'asc' } },
          paramNotes:  true,
          screenshots: { select: { id: true, filename: true, createdAt: true } },
        },
      },
    },
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link href={`${base}/events`} className="text-sm text-muted-foreground hover:underline">
          ← Events
        </Link>
      </div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold">Dev Docs</h2>
        <p className="text-sm text-muted-foreground mt-1">
          DataLayer implementation documentation for {project.name}
        </p>
      </div>

      <DataLayerPageClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        doc={doc as any}
        apiBase={apiBase}
        projectName={project.name}
      />
    </div>
  )
}
