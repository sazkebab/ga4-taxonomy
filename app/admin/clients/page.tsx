import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import AdminClientsClient from './AdminClientsClient'
import InviteUserButton from './InviteUserButton'

export default async function AdminClientsPage() {
  const session = await auth()
  if (!session?.user?.id) notFound()

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  })
  if (!user?.isSuperAdmin) notFound()

  const clients = await db.client.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { projects: true, users: true } },
    },
  })

  const allUsers = await db.user.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, image: true, isSuperAdmin: true },
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
          <h2 className="text-2xl font-semibold">Admin — Clients</h2>
          <p className="text-sm text-muted-foreground mt-1">{clients.length} clients</p>
        </div>
        <AdminClientsClient action="create" allUsers={allUsers} />
      </div>

      {clients.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No clients yet</p>
        </div>
      )}

      <div className="space-y-3">
        {clients.map((client) => (
          <Card key={client.id}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Link
                    href={`/clients/${client.id}/projects`}
                    className="font-medium hover:underline"
                  >
                    {client.name}
                  </Link>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {client._count.projects} project{client._count.projects !== 1 ? 's' : ''} · {client._count.users} user{client._count.users !== 1 ? 's' : ''}
                  </p>
                </div>
                <Link href={`/admin/clients/${client.id}`}>
                  <span className="text-sm text-primary hover:underline">Manage →</span>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Users section */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Users</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{allUsers.length} user{allUsers.length !== 1 ? 's' : ''}</p>
          </div>
          <InviteUserButton />
        </div>
        <Card>
          <CardContent className="p-0">
            {allUsers.length === 0 && (
              <p className="text-sm text-muted-foreground p-6">No users yet.</p>
            )}
            <div className="divide-y">
              {allUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{u.name ?? u.email}</p>
                      {!u.name && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
                          Pending sign-in
                        </Badge>
                      )}
                      {u.isSuperAdmin && (
                        <Badge className="text-xs px-1.5 py-0 bg-purple-100 text-purple-700 border-purple-200">
                          Super admin
                        </Badge>
                      )}
                    </div>
                    {u.name && <p className="text-xs text-muted-foreground">{u.email}</p>}
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
