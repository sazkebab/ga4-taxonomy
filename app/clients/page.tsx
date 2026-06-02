import Link from 'next/link'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function ClientsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')

  const userId = session.user.id
  const user = await db.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } })

  const clients = user?.isSuperAdmin
    ? await db.client.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { projects: true, users: true } } },
      })
    : await db.client.findMany({
        where: { OR: [{ users: { some: { userId } } }, { isTemplate: true }] },
        orderBy: { name: 'asc' },
        include: { _count: { select: { projects: true, users: true } } },
      })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Clients</h2>
          <p className="text-sm text-muted-foreground mt-1">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        {user?.isSuperAdmin && (
          <Link
            href="/admin/clients"
            className="text-sm text-primary hover:underline"
          >
            Manage clients →
          </Link>
        )}
      </div>

      {clients.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No clients yet</p>
          {user?.isSuperAdmin ? (
            <p className="text-sm mt-1">
              <Link href="/admin/clients" className="text-primary hover:underline">Create your first client</Link>
            </p>
          ) : (
            <p className="text-sm mt-1">You haven&apos;t been assigned to any clients yet.</p>
          )}
        </div>
      )}

      <div className="grid gap-3">
        {clients.map((client) => (
          <Link
            key={client.id}
            href={`/clients/${client.slug}/projects`}
            className="block"
          >
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{client.name}</p>
                    {client.isTemplate && (
                      <Badge className="text-xs px-1.5 py-0 bg-green-100 text-green-700 border-green-200">
                        Template
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {client._count.projects} project{client._count.projects !== 1 ? 's' : ''}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {client._count.users} user{client._count.users !== 1 ? 's' : ''}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
