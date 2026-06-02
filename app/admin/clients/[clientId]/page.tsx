import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import AdminClientDetail from './AdminClientDetail'

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) notFound()

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  })
  if (!me?.isSuperAdmin) notFound()

  const { clientId } = await params
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: {
      users: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      projects: { orderBy: { name: 'asc' }, include: { _count: { select: { events: true } } } },
    },
  })
  if (!client) notFound()

  const allUsers = await db.user.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, image: true, isSuperAdmin: true },
  })

  const assignedUserIds = new Set(client.users.map((cu) => cu.userId))
  const unassignedUsers = allUsers.filter((u) => !assignedUserIds.has(u.id))

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-2">
        <Link href="/admin/clients" className="text-sm text-muted-foreground hover:underline">
          ← Admin / Clients
        </Link>
      </div>

      <div className="mt-2 mb-6">
        <h2 className="text-2xl font-semibold">{client.name}</h2>
      </div>

      <div className="space-y-6">
        {/* Rename client */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client name</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminClientDetail
              clientId={clientId}
              currentName={client.name}
              action="rename"
            />
          </CardContent>
        </Card>

        {/* Template toggle */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visibility</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Template clients are visible to every logged-in user without needing to be assigned.
              </p>
            </div>
            <AdminClientDetail
              clientId={clientId}
              action="toggle-template"
              isTemplate={client.isTemplate}
            />
          </CardContent>
        </Card>

        {/* Projects */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Projects</CardTitle>
            <AdminClientDetail clientId={clientId} action="create-project" />
          </CardHeader>
          <CardContent className="p-0">
            {client.projects.length === 0 && (
              <p className="text-sm text-muted-foreground px-6 py-4">No projects yet.</p>
            )}
            <div className="divide-y">
              {client.projects.map((project) => (
                <div key={project.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <Link
                      href={`/clients/${client.slug}/projects/${project.slug}/events`}
                      className="text-sm font-medium hover:underline"
                    >
                      {project.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {project._count.events} events
                    </p>
                  </div>
                  <AdminClientDetail
                    clientId={clientId}
                    action="delete-project"
                    projectId={project.id}
                    projectName={project.name}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Assigned users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Assigned users</CardTitle>
            <AdminClientDetail
              clientId={clientId}
              action="assign-user"
              unassignedUsers={unassignedUsers}
            />
          </CardHeader>
          <CardContent className="p-0">
            {client.users.length === 0 && (
              <p className="text-sm text-muted-foreground px-6 py-4">No users assigned yet.</p>
            )}
            <div className="divide-y">
              {client.users.map((cu) => (
                <div key={cu.userId} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium">{cu.user.name ?? cu.user.email}</p>
                    {cu.user.name && <p className="text-xs text-muted-foreground">{cu.user.email}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <AdminClientDetail
                      clientId={clientId}
                      action="remove-user"
                      userId={cu.userId}
                      userName={cu.user.name ?? cu.user.email ?? 'user'}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Danger zone */}
        <div>
          <Separator />
          <div className="mt-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete client</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently deletes all projects, events and parameters. Cannot be undone.
              </p>
            </div>
            <AdminClientDetail
              clientId={clientId}
              clientName={client.name}
              action="delete-client"
            />
          </div>
        </div>

        {/* Make super admin */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All users</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {allUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium">{u.name ?? u.email}</p>
                    {u.name && <p className="text-xs text-muted-foreground">{u.email}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {u.isSuperAdmin && (
                      <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">
                        Super admin
                      </Badge>
                    )}
                    <AdminClientDetail
                      clientId={clientId}
                      action="toggle-admin"
                      userId={u.id}
                      userName={u.name ?? u.email ?? 'user'}
                      isSuperAdmin={u.isSuperAdmin}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
