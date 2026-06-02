import { db } from '@/lib/db'

export async function requireClientAccess(userId: string, clientId: string) {
  const [user, client] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }),
    db.client.findUnique({ where: { id: clientId }, select: { isTemplate: true } }),
  ])
  if (user?.isSuperAdmin) return
  if (client?.isTemplate) return   // template clients are accessible to all logged-in users
  const membership = await db.clientUser.findUnique({
    where: { clientId_userId: { clientId, userId } },
  })
  if (!membership) throw new Error('Forbidden')
}

export async function requireProjectAccess(userId: string, projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  })
  if (!project) throw new Error('Not found')
  await requireClientAccess(userId, project.clientId)
}

export function forbidden() {
  return new Response(JSON.stringify({ error: 'Forbidden' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function notFoundResponse() {
  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
}
