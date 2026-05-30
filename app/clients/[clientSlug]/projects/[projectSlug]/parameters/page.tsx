import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { resolveProject } from '@/lib/resolve-route'
import { Card, CardContent } from '@/components/ui/card'
import ParametersClient from './ParametersClient'
import ParametersPageClient from './ParametersPageClient'
import ParametersBulkManager from './ParametersBulkManager'

export default async function ParametersPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string; projectSlug: string }>
  searchParams: Promise<{ filter?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) notFound()

  const { clientSlug, projectSlug } = await params
  const { filter = '' } = await searchParams

  const { project, base, apiBase } = await resolveProject(clientSlug, projectSlug, session.user.id)

  const projectDetail = await db.project.findUnique({
    where: { id: project.id },
    select: { ga4PropertyId: true },
  })

  const allParameters = await db.parameter.findMany({
    where: { projectId: project.id },
    orderBy: [{ isGlobal: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { events: true } } },
  })

  const parameters = filter === 'ga4_pending'
    ? allParameters.filter((p) => p.requiresGA4Registration && !p.ga4Registered)
    : filter === 'ga4_registered'
    ? allParameters.filter((p) => p.requiresGA4Registration && p.ga4Registered)
    : filter === 'global'
    ? allParameters.filter((p) => p.isGlobal)
    : allParameters

  const ga4PendingCount = allParameters.filter((p) => p.requiresGA4Registration && !p.ga4Registered).length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-2">
        <Link href={`${base}/events`} className="text-sm text-muted-foreground hover:underline">
          ← Events
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6 mt-2">
        <div>
          <h2 className="text-2xl font-semibold">Parameters</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {parameters.length}{parameters.length !== allParameters.length ? ` of ${allParameters.length}` : ''} parameters
          </p>
        </div>
        <div className="flex gap-2">
          {/* Bulk GA4 register button — only shown when property is configured */}
          {projectDetail?.ga4PropertyId && (
            <ParametersPageClient
              action="ga4-register"
              apiBase={apiBase}
              ga4PendingCount={ga4PendingCount}
            />
          )}
          <ParametersClient action="create" apiBase={apiBase} />
        </div>
      </div>

      {/* Filters */}
      <ParametersPageClient
        action="filter"
        currentFilter={filter}
        counts={{
          '': allParameters.length,
          ga4_pending: ga4PendingCount,
          ga4_registered: allParameters.filter((p) => p.requiresGA4Registration && p.ga4Registered).length,
          global: allParameters.filter((p) => p.isGlobal).length,
        }}
      />

      <Card className="mt-4">
        <CardContent className="p-0">
          {parameters.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">
              {filter ? 'No parameters match this filter.' : 'No parameters yet.'}
            </p>
          ) : (
            <ParametersBulkManager parameters={parameters} apiBase={apiBase} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
