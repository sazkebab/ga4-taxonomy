import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'

/**
 * GET /api/resolve?clientSlug=ract&projectSlug=default
 * Returns { clientName, projectName } for use by the Sidebar.
 * Only used for display — access is implicitly validated by being authenticated.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const clientSlug  = searchParams.get('clientSlug')
  const projectSlug = searchParams.get('projectSlug')

  if (!clientSlug) return NextResponse.json({}, { status: 200 })

  const client = await db.client.findUnique({
    where: { slug: clientSlug },
    select: { name: true },
  })
  if (!client) return NextResponse.json({}, { status: 200 })

  if (!projectSlug) {
    return NextResponse.json({ clientName: client.name })
  }

  const project = await db.project.findFirst({
    where: { client: { slug: clientSlug }, slug: projectSlug },
    select: { name: true },
  })

  return NextResponse.json({
    clientName:  client.name,
    projectName: project?.name ?? null,
  })
}
