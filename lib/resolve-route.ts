/**
 * Server-side helpers that resolve slug-based route params to DB entities
 * and return the `apiBase` (ID-based, for API calls) and `base` (slug-based, for nav links).
 */
import { notFound } from 'next/navigation'
import { db } from './db'
import { requireClientAccess, requireProjectAccess } from './access'

export async function resolveClient(clientSlug: string, userId: string) {
  const client = await db.client.findUnique({ where: { slug: clientSlug } })
  if (!client) notFound()
  try {
    await requireClientAccess(userId, client.id)
  } catch {
    notFound()
  }
  return client
}

export async function resolveProject(
  clientSlug: string,
  projectSlug: string,
  userId: string,
) {
  const client = await db.client.findUnique({ where: { slug: clientSlug } })
  if (!client) notFound()

  const project = await db.project.findFirst({
    where: { clientId: client.id, slug: projectSlug },
  })
  if (!project) notFound()

  try {
    await requireProjectAccess(userId, project.id)
  } catch {
    notFound()
  }

  return {
    client,
    project,
    /** ID-based prefix for all API calls */
    apiBase: `/api/clients/${client.id}/projects/${project.id}`,
    /** Slug-based prefix for in-app navigation links */
    base: `/clients/${clientSlug}/projects/${projectSlug}`,
  }
}
