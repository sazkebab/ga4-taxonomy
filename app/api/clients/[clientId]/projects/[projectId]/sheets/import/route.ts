import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { getGoogleAccessToken } from '@/lib/token'
import { extractSheetId, getSheetsClient } from '@/lib/sheets'
import { requireProjectAccess } from '@/lib/access'

const previewSchema = z.object({
  url: z.string().url(),
  sheetName: z.string().optional(),
})

const importSchema = z.object({
  url: z.string().url(),
  sheetName: z.string().optional(),
  headerRow: z.number().int().min(0).default(0),
  mappings: z.object({
    eventName: z.number().optional(),
    trigger: z.number().optional(),
    parameters: z.array(z.number()).optional(),
  }),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; projectId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, projectId } = await params
  try {
    await requireProjectAccess(session.user.id, projectId)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const mode = body.mode ?? 'preview'

  const accessToken = await getGoogleAccessToken()
  if (!accessToken) return NextResponse.json({ error: 'No Google access token' }, { status: 401 })

  if (mode === 'preview') {
    const parsed = previewSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const sheetId = extractSheetId(parsed.data.url)
    if (!sheetId) return NextResponse.json({ error: 'Invalid Google Sheets URL' }, { status: 400 })

    const sheets = getSheetsClient(accessToken)
    const range = parsed.data.sheetName ? `${parsed.data.sheetName}!A:ZZ` : 'A:ZZ'
    const result = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range, majorDimension: 'ROWS' })
    const rows = result.data.values ?? []
    return NextResponse.json({ rows: rows.slice(0, 10), totalRows: rows.length })
  }

  if (mode === 'import') {
    const parsed = importSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const sheetId = extractSheetId(parsed.data.url)
    if (!sheetId) return NextResponse.json({ error: 'Invalid Google Sheets URL' }, { status: 400 })

    const sheets = getSheetsClient(accessToken)
    const range = parsed.data.sheetName ? `${parsed.data.sheetName}!A:ZZ` : 'A:ZZ'
    const result = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range, majorDimension: 'ROWS' })

    const rows = result.data.values ?? []
    const dataRows = rows.slice(parsed.data.headerRow + 1)
    const { mappings } = parsed.data

    let eventsCreated = 0
    let eventsSkipped = 0
    let parametersCreated = 0

    for (const row of dataRows) {
      const eventName = mappings.eventName !== undefined ? row[mappings.eventName]?.trim() : undefined
      if (!eventName) continue

      const trigger = mappings.trigger !== undefined ? row[mappings.trigger]?.trim() ?? '' : ''

      const existing = await db.event.findFirst({ where: { projectId, name: eventName } })
      if (existing) {
        eventsSkipped++
      } else {
        await db.event.create({ data: { projectId, name: eventName, trigger } })
        eventsCreated++
      }

      if (mappings.parameters && mappings.parameters.length > 0) {
        for (const colIdx of mappings.parameters) {
          const paramName = row[colIdx]?.trim()
          if (!paramName) continue

          let param = await db.parameter.findUnique({ where: { projectId_name: { projectId, name: paramName } } })
          if (!param) {
            param = await db.parameter.create({ data: { projectId, name: paramName } })
            parametersCreated++
          }

          const event = await db.event.findFirst({ where: { projectId, name: eventName } })
          if (event) {
            await db.eventParameter.upsert({
              where: { eventId_parameterId: { eventId: event.id, parameterId: param.id } },
              update: {},
              create: { eventId: event.id, parameterId: param.id },
            })
          }
        }
      }
    }

    return NextResponse.json({ eventsCreated, eventsSkipped, parametersCreated })
  }

  return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
}
