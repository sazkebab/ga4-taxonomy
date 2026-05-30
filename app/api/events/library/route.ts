/**
 * GET /api/events/library
 * Returns all accessible events grouped by client → project.
 * Super admins see everything; regular users see their assigned clients only.
 * Excludes the caller's own project (passed as ?excludeProjectId=xxx).
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const excludeProjectId = req.nextUrl.searchParams.get('excludeProjectId') ?? undefined

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  })

  // Build client filter
  const clientWhere = user?.isSuperAdmin
    ? {}
    : { users: { some: { userId: session.user.id } } }

  const clients = await db.client.findMany({
    where: clientWhere,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      projects: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          events: {
            where: excludeProjectId ? { projectId: { not: excludeProjectId } } : undefined,
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              trigger: true,
              isKeyEvent: true,
              requiresDataLayer: true,
              parameters: {
                select: {
                  parameter: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  // Reshape events: flatten EventParameter → parameter
  const result = clients.map((client) => ({
    id: client.id,
    name: client.name,
    projects: client.projects
      .filter((p) => p.id !== excludeProjectId)
      .map((project) => ({
        id: project.id,
        name: project.name,
        events: project.events.map((event) => ({
          id: event.id,
          name: event.name,
          trigger: event.trigger,
          isKeyEvent: event.isKeyEvent,
          requiresDataLayer: event.requiresDataLayer,
          parameters: event.parameters.map((ep) => ({
            id: ep.parameter.id,
            name: ep.parameter.name,
          })),
        })),
      }))
      .filter((p) => p.events.length > 0),
  })).filter((c) => c.projects.length > 0)

  return NextResponse.json(result)
}
