import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { resolveProject } from '@/lib/resolve-route'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import ChecklistPanel from '@/components/ChecklistPanel'
import EventDetailClient from './EventDetailClient'

interface Parameter {
  id: string
  name: string
  description: string
  type: string
  isGlobal: boolean
  requiresGA4Registration: boolean
  ga4Registered: boolean
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ clientSlug: string; projectSlug: string; id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) notFound()

  const { clientSlug, projectSlug, id } = await params
  const { project, base, apiBase } = await resolveProject(clientSlug, projectSlug, session.user.id)

  const event = await db.event.findUnique({ where: { id } })
  if (!event || event.projectId !== project.id) notFound()

  const [eventParamLinks, globalParams, allParameters, categoryRows] = await Promise.all([
    db.eventParameter.findMany({
      where: { eventId: id },
      include: { parameter: true },
      orderBy: { parameter: { name: 'asc' } },
    }),
    db.parameter.findMany({
      where: { isGlobal: true, projectId: project.id },
      orderBy: { name: 'asc' },
    }),
    db.parameter.findMany({
      where: { projectId: project.id },
      orderBy: { name: 'asc' },
    }),
    db.event.findMany({
      where:    { projectId: project.id, NOT: { category: '' } },
      select:   { category: true },
      distinct: ['category'],
      orderBy:  { category: 'asc' },
    }),
  ])
  const categories = categoryRows.map((r) => r.category)

  const eventParamIds = new Set(eventParamLinks.map((l) => l.parameterId))
  const uniqueGlobals = globalParams.filter((p) => !eventParamIds.has(p.id))

  const parameters: (Parameter & { isGlobalAttached: boolean })[] = [
    ...uniqueGlobals.map((p) => ({ ...p, isGlobalAttached: true })),
    ...eventParamLinks.map((l) => ({ ...l.parameter, isGlobalAttached: false })),
  ]

  const checklistInit = {
    checkDocumented: event.checkDocumented,
    checkDataLayerDoc: event.checkDataLayerDoc,
    checkGtmSetUp: event.checkGtmSetUp,
    checkGtmPasses: event.checkGtmPasses,
    checkGa4KeyEvent: event.checkGa4KeyEvent,
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`${base}/events`} className="text-sm text-muted-foreground hover:underline">
          ← Events
        </Link>
        <div className="flex items-center gap-2 mt-2">
          <h2 className="text-2xl font-semibold">{event.name}</h2>
          {event.isKeyEvent && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">Key event</Badge>
          )}
          {event.requiresDataLayer && <Badge variant="secondary">dataLayer</Badge>}
        </div>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event details</CardTitle>
          </CardHeader>
          <CardContent>
            <EventDetailClient event={event} apiBase={apiBase} eventsBase={`${base}/events`} categories={categories} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Implementation checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <ChecklistPanel
              checklistUrl={`${apiBase}/events/${event.id}/checklist`}
              isKeyEvent={event.isKeyEvent}
              requiresDataLayer={event.requiresDataLayer}
              initial={checklistInit}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <EventDetailClient
              event={event}
              apiBase={apiBase}
              eventsBase={`${base}/events`}
              parameters={parameters}
              allParameters={allParameters}
              showParameters
            />
          </CardContent>
        </Card>
      </div>

      <Separator className="my-6" />

      <div className="flex justify-end">
        <EventDetailClient event={event} apiBase={apiBase} eventsBase={`${base}/events`} showDelete />
      </div>
    </div>
  )
}
