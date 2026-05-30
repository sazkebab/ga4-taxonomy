import Link from 'next/link'
import { auth } from '@/auth'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { resolveProject } from '@/lib/resolve-route'
import { Button } from '@/components/ui/button'
import EventsSearch from './EventsSearch'
import CopyEventsDialog from './CopyEventsDialog'
import EventsListClient, { type EventItem } from './EventsListClient'

// ─── Stage definitions ────────────────────────────────────────────────────────

type StageKey = 'not_started' | 'dl_doc' | 'dl_impl' | 'gtm' | 'passed'

const STAGES: { key: StageKey; label: string; color: string }[] = [
  { key: 'not_started', label: 'Not started',           color: 'bg-slate-400' },
  { key: 'dl_doc',      label: 'dataLayer doc done',    color: 'bg-blue-400' },
  { key: 'dl_impl',     label: 'dataLayer implemented', color: 'bg-indigo-400' },
  { key: 'gtm',         label: 'GTM work done',         color: 'bg-amber-400' },
  { key: 'passed',      label: 'Work passed',           color: 'bg-green-500' },
]

const STAGE_MAP   = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<StageKey, typeof STAGES[number]>
const STAGE_ORDER = Object.fromEntries(STAGES.map((s, i) => [s.key, i]))  as Record<StageKey, number>

// checkDataLayerDoc = "dataLayer document done"
// checkDocumented   = "dataLayer implemented" (repurposed field)
// checkGtmSetUp     = "GTM work done"
// checkGtmPasses    = "Work passed"
type EventForStage = {
  requiresDataLayer: boolean
  checkDataLayerDoc: boolean
  checkDocumented: boolean
  checkGtmSetUp: boolean
  checkGtmPasses: boolean
}

function getStage(e: EventForStage): StageKey {
  if (e.checkGtmPasses) return 'passed'
  if (e.checkGtmSetUp) return 'gtm'
  if (e.requiresDataLayer) {
    if (e.checkDocumented) return 'dl_impl'
    if (e.checkDataLayerDoc) return 'dl_doc'
  }
  return 'not_started'
}

// ─── Data ─────────────────────────────────────────────────────────────────────

type EventRow = Awaited<ReturnType<typeof loadEvents>>[number]

async function loadEvents(projectId: string, q: string, baseFilter: string, ga4Filter: string, sort: string) {
  const where: Record<string, unknown> = { projectId }
  if (q) where.OR = [{ name: { contains: q } }, { notes: { contains: q } }]
  if (baseFilter === 'keyEvent')  where.isKeyEvent = true
  if (baseFilter === 'dataLayer') where.requiresDataLayer = true
  if (ga4Filter === 'notFired')   where.ga4FireCount = 0

  // DB-level sort for name/category; fires/stage are handled in TS after stage computation
  const orderBy =
    sort === 'name_desc'     ? { name:     'desc' as const } :
    sort === 'category_asc'  ? { category: 'asc'  as const } :
    sort === 'category_desc' ? { category: 'desc' as const } :
                               { name:     'asc'  as const }

  return db.event.findMany({
    where,
    orderBy,
    include: {
      parameters: {
        select: {
          value:     true,
          parameter: { select: { id: true, name: true } },
        },
        orderBy: { parameter: { name: 'asc' } },
      },
    },
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string; projectSlug: string }>
  searchParams: Promise<{ q?: string; filter?: string; stage?: string; ga4?: string; sort?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) notFound()

  const { clientSlug, projectSlug } = await params
  const { q = '', filter = '', stage = '', ga4 = '', sort = '' } = await searchParams

  const { project, base, apiBase } = await resolveProject(clientSlug, projectSlug, session.user.id)

  // Fetch ga4PropertyId (not returned by resolveProject)
  const projectDetail = await db.project.findUnique({
    where: { id: project.id },
    select: { ga4PropertyId: true },
  })

  const allEvents = await loadEvents(project.id, q, filter, ga4, sort)

  // Apply stage filter in TypeScript (avoids complex Prisma OR conditions)
  const events = stage
    ? allEvents.filter((e) => getStage(e) === stage)
    : allEvents

  // Stage counts for filter badges
  const stageCounts = Object.fromEntries(
    STAGES.map((s) => [s.key, allEvents.filter((e) => getStage(e) === s.key).length])
  ) as Record<StageKey, number>

  // Not-fired count (events that have been checked and have 0 fires)
  const notFiredCount = allEvents.filter((e) => e.ga4FireCount === 0).length

  // Serialise events for the client component (compute stage info server-side)
  const eventItems: EventItem[] = events.map((event) => {
    const eventStage = getStage(event)
    const stageInfo = STAGE_MAP[eventStage]
    return {
      id:                event.id,
      name:              event.name,
      category:          event.category ?? '',
      trigger:           event.trigger,
      notes:             event.notes ?? '',
      isKeyEvent:        event.isKeyEvent,
      requiresDataLayer: event.requiresDataLayer,
      parameters:        event.parameters.map((ep) => ({ ...ep.parameter, value: ep.value ?? 'dynamic' })),
      stage:             eventStage,
      stageLabel:        stageInfo.label,
      stageColor:        stageInfo.color,
      ga4FireCount:      event.ga4FireCount,
      ga4CheckedAt:      event.ga4CheckedAt?.toISOString() ?? null,
    }
  })

  // Apply sorts that depend on computed fields (fires, stage)
  if (sort === 'fires_desc') {
    eventItems.sort((a, b) => {
      if (a.ga4FireCount === null && b.ga4FireCount === null) return 0
      if (a.ga4FireCount === null) return 1   // nulls last
      if (b.ga4FireCount === null) return -1
      return b.ga4FireCount - a.ga4FireCount
    })
  } else if (sort === 'fires_asc') {
    eventItems.sort((a, b) => {
      if (a.ga4FireCount === null && b.ga4FireCount === null) return 0
      if (a.ga4FireCount === null) return 1   // nulls last
      if (b.ga4FireCount === null) return -1
      return a.ga4FireCount - b.ga4FireCount
    })
  } else if (sort === 'stage_asc') {
    eventItems.sort((a, b) => STAGE_ORDER[a.stage as StageKey] - STAGE_ORDER[b.stage as StageKey])
  } else if (sort === 'stage_desc') {
    eventItems.sort((a, b) => STAGE_ORDER[b.stage as StageKey] - STAGE_ORDER[a.stage as StageKey])
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-2">
        <Link href={`/clients/${clientSlug}/projects`} className="text-sm text-muted-foreground hover:underline">
          ← {project.name}
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6 mt-2">
        <div>
          <h2 className="text-2xl font-semibold">Events</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {events.length}{events.length !== allEvents.length ? ` of ${allEvents.length}` : ''} events
          </p>
        </div>
        <div className="flex gap-2">
          <CopyEventsDialog
            clientId={project.clientId}
            projectId={project.id}
            copyUrl={`${apiBase}/events/copy`}
            libraryUrl={`/api/events/library?excludeProjectId=${project.id}`}
          />
          <Link href={`${base}/events/new`}>
            <Button>+ New event</Button>
          </Link>
        </div>
      </div>

      <EventsSearch
        defaultQ={q}
        defaultFilter={filter}
        defaultStage={stage}
        defaultGa4={ga4}
        defaultSort={sort}
        stageCounts={stageCounts}
        notFiredCount={notFiredCount}
      />

      <div className="mt-4">
        {events.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">No events{stage || filter || q ? ' match your filters' : ' yet'}</p>
            {!stage && !filter && !q && (
              <p className="text-sm mt-1">Create your first event or copy from an existing project</p>
            )}
          </div>
        ) : (
          <EventsListClient
            events={eventItems}
            base={base}
            apiBase={apiBase}
            hasGa4Property={!!projectDetail?.ga4PropertyId}
            stages={STAGES}
            currentSort={sort || 'name_asc'}
          />
        )}
      </div>
    </div>
  )
}
