import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { resolveProject } from '@/lib/resolve-route'
import { getGoogleAccessToken } from '@/lib/token'
import { getGA4Clients } from '@/lib/ga4'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import GA4PropertyForm from './GA4PropertyForm'
import GA4EventsPanel from './GA4EventsPanel'
import GA4SyncPanel from '@/components/GA4SyncPanel'

export default async function GA4Page({
  params,
}: {
  params: Promise<{ clientSlug: string; projectSlug: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) notFound()

  const { clientSlug, projectSlug } = await params
  const { project, base, apiBase } = await resolveProject(clientSlug, projectSlug, session.user.id)

  const projectDetail = await db.project.findUnique({
    where: { id: project.id },
    select: { ga4PropertyId: true },
  })

  // Best-effort: fetch the property display name so the user can confirm they're connected to the right property
  let propertyName: string | null = null
  if (projectDetail?.ga4PropertyId) {
    try {
      const accessToken = await getGoogleAccessToken()
      if (accessToken) {
        const { adminClient } = getGA4Clients(accessToken)
        const [property] = await adminClient.getProperty({ name: `properties/${projectDetail.ga4PropertyId}` })
        propertyName = property?.displayName ?? null
      }
    } catch {
      // Ignore — name display is best-effort; invalid IDs or auth errors are handled gracefully
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="mb-2">
        <Link href={`${base}/events`} className="text-sm text-muted-foreground hover:underline">
          ← Events
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-semibold">GA4 Sync</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect to your GA4 property to check event status and find undocumented events
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">GA4 Property</CardTitle>
          <CardDescription>
            Enter your GA4 property ID (e.g. 123456789 — found in GA4 Admin → Property Settings)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GA4PropertyForm
            currentPropertyId={projectDetail?.ga4PropertyId ?? ''}
            currentPropertyName={propertyName}
            propertyUrl={`${apiBase}/ga4/property`}
          />
        </CardContent>
      </Card>

      {projectDetail?.ga4PropertyId && (
        <>
          <Separator />
          <GA4SyncPanel syncUrl={`${apiBase}/ga4/sync`} />
          <Separator />
          <GA4EventsPanel eventsUrl={`${apiBase}/ga4/events`} eventsBase={`${base}/events`} />
        </>
      )}
    </div>
  )
}
