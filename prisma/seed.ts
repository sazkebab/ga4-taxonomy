/**
 * Seed script — populates the database from Google Sheets CSV exports and XLSX files.
 * Each sheet becomes a Client with a single "Default" project.
 * Parameters are shared at the client level; events belong to the project.
 *
 * Usage: npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import https from 'https'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { slugify } from '../lib/slug'

const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' })
const db = new PrismaClient({ adapter })

// ─── Sheet sources ────────────────────────────────────────────────────────────
// Each source has a local CSV file, a local XLSX file, or a Google Sheet ID.
// Local files take priority when present.

const SOURCES: { label: string; localFile?: string; localXlsx?: string; sheetId?: string }[] = [
  { label: 'RACT',              localFile: 'prisma/seeds/ract.csv' },
  { label: 'Our DNA',           localFile: 'prisma/seeds/our-dna.csv' },
  { label: 'MT Buller',         localXlsx: 'prisma/seeds/mt-buller.xlsx' },
  { label: 'Landata',           localXlsx: 'prisma/seeds/landata.xlsx' },
  { label: 'auDA',              localXlsx: 'prisma/seeds/auda.xlsx' },
  { label: 'Meliorum training', localXlsx: 'prisma/seeds/meliorum-training.xlsx' },
  { label: 'Sheet 1', sheetId: '10bgRQJVwWc-eoFpZy3MsAJ3K6_AMBamiMNRjZQF2LjQ' },
  { label: 'Sheet 3', sheetId: '1-WkYxTiGRPGdA-yFOUW1g8WraoYak4q4JcqGTGFN1j4' },
  { label: 'Sheet 7', sheetId: '1UJRm-I2Y89wOEXiRiXcfjfKFdsNbKS4YHFUCF4MoeVw' },
]

// ─── CSV fetch ────────────────────────────────────────────────────────────────

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject)
        return
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function fetchSheetCsv(sheetId: string): Promise<string | null> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`
  try {
    return await fetchUrl(url)
  } catch (e) {
    console.warn(`  ⚠ Could not fetch sheet ${sheetId}: ${(e as Error).message}`)
    return null
  }
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
// Handles multiline quoted fields (e.g. "Doc\nDone" in headers).

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cells: string[] = []
  let cell = ''
  let inQuote = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (ch === '"') {
      if (inQuote && next === '"') { cell += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      cells.push(cell.trim())
      cell = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && next === '\n') i++ // CRLF
      cells.push(cell.trim())
      rows.push(cells)
      cells = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell || cells.length > 0) {
    cells.push(cell.trim())
    rows.push(cells)
  }
  return rows
}

// ─── XLSX reader ─────────────────────────────────────────────────────────────
// Reads the "Event Naming" sheet (or first sheet) and returns string[][].
// Booleans are converted to "TRUE"/"FALSE" for consistency with CSV parsing.

function readXlsx(filePath: string): string[][] {
  const workbook = XLSX.readFile(filePath)
  const sheetName = workbook.SheetNames.includes('Event Naming')
    ? 'Event Naming'
    : workbook.SheetNames[0]
  const ws = workbook.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  return raw.map((row) =>
    (row as unknown[]).map((cell) => {
      if (typeof cell === 'boolean') return cell ? 'TRUE' : 'FALSE'
      if (cell === null || cell === undefined) return ''
      return String(cell)
    })
  )
}

// ─── Sheet structure ──────────────────────────────────────────────────────────
// Row 0: client name somewhere in cols 0–4 (e.g. "RACT - Event Naming")
// Header row: scanned in rows 1–7, contains "Event name" column
//   "Trigger"                  → triggerCol (dynamic)
//   "Key event"                → keyEventCol (optional)
//   "developer input needed"   → devInputCol (optional)
//   "Event name"               → eventNameCol
//   cols after Event name      → parameter headers
// Rows after header: data rows (skip if event name empty or "NA")

interface SheetData {
  clientName: string
  events: {
    name: string
    trigger: string
    isKeyEvent: boolean
    requiresDataLayer: boolean
    parameters: string[]
  }[]
  allParameters: string[]
}

function parseSheet(rows: string[][]): SheetData | null {
  if (rows.length < 3) return null

  // Client name: scan row 0, cols 0–4 for first non-empty string value
  let rawName = ''
  for (let c = 0; c <= 4 && !rawName; c++) {
    const val = (rows[0]?.[c] ?? '').trim()
    // Skip boolean-like values that crept in from XLSX
    if (val && val !== 'TRUE' && val !== 'FALSE') rawName = val
  }
  if (!rawName) return null
  const clientName = rawName.replace(/\s*-\s*Event Naming\s*$/i, '').trim() || rawName

  // Find header row — scan rows 1–7 for a row containing "Event name"
  let headerRowIdx = -1
  let headerRow: string[] = []
  for (let r = 1; r <= Math.min(7, rows.length - 1); r++) {
    const row = rows[r]
    const normalized = row.map((c) => c.toLowerCase().replace(/\s+/g, ' ').trim())
    if (normalized.some((c) => c === 'event name')) {
      headerRowIdx = r
      headerRow = row
      break
    }
  }
  if (headerRowIdx < 0) return null

  // Find key column indices from header
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const eventNameCol = headerRow.findIndex((h) => norm(h) === 'event name')
  const triggerCol   = headerRow.findIndex((h) => norm(h) === 'trigger')
  const keyEventCol  = headerRow.findIndex((h) => norm(h) === 'key event')
  const devInputCol  = headerRow.findIndex((h) => norm(h).includes('developer') && norm(h).includes('input'))

  if (eventNameCol < 0) return null

  // Parameter headers start right after Event name column
  const paramStartCol = eventNameCol + 1
  const paramHeaders: string[] = []
  for (let i = paramStartCol; i < headerRow.length; i++) {
    const h = (headerRow[i] ?? '').trim()
    if (h && h !== 'NA') paramHeaders.push(h)
    else paramHeaders.push('') // keep index alignment
  }

  const allParameters = new Set<string>()
  const events: SheetData['events'] = []

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue

    const eventName = (row[eventNameCol] ?? '').trim()
    if (!eventName || eventName === 'NA' || norm(eventName) === 'event name') continue

    const trigger = triggerCol >= 0 ? (row[triggerCol] ?? '').trim() : ''
    const isKeyEvent = keyEventCol >= 0 ? (row[keyEventCol] ?? '').toUpperCase() === 'TRUE' : false
    const requiresDataLayer = devInputCol >= 0
      ? (row[devInputCol] ?? '').toLowerCase().trim() === 'yes' ||
        (row[devInputCol] ?? '').toUpperCase() === 'TRUE'
      : false

    const eventParams: string[] = []
    for (let i = 0; i < paramHeaders.length; i++) {
      const paramName = paramHeaders[i]
      if (!paramName) continue
      const cellVal = (row[paramStartCol + i] ?? '').trim()
      // Non-empty, non-NA, non-FALSE = parameter applies to this event
      if (cellVal && cellVal !== 'NA' && cellVal.toUpperCase() !== 'FALSE') {
        eventParams.push(paramName)
        allParameters.add(paramName)
      }
    }

    events.push({ name: eventName, trigger, isKeyEvent, requiresDataLayer, parameters: eventParams })
  }

  return { clientName, events, allParameters: [...allParameters] }
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seedSheet(data: SheetData) {
  console.log(`\n  Client: ${data.clientName}`)

  // Upsert client
  let client = await db.client.findUnique({ where: { name: data.clientName } })
  if (!client) {
    client = await db.client.create({ data: { name: data.clientName, slug: slugify(data.clientName) } })
    console.log(`    ✓ Created client`)
  } else {
    console.log(`    · Client already exists`)
  }

  // Upsert default project
  let project = await db.project.findUnique({
    where: { clientId_name: { clientId: client.id, name: 'Default' } },
  })
  if (!project) {
    project = await db.project.create({ data: { name: 'Default', slug: 'default', clientId: client.id } })
    console.log(`    ✓ Created default project`)
  }

  // Upsert parameters (scoped to project)
  const paramMap = new Map<string, string>() // name → id
  for (const paramName of data.allParameters) {
    let param = await db.parameter.findUnique({
      where: { projectId_name: { projectId: project.id, name: paramName } },
    })
    if (!param) {
      param = await db.parameter.create({ data: { name: paramName, projectId: project.id } })
    }
    paramMap.set(paramName, param.id)
  }
  console.log(`    ✓ ${paramMap.size} parameters upserted`)

  // Upsert events
  let eventsCreated = 0
  let eventsSkipped = 0

  for (const ev of data.events) {
    let event = await db.event.findFirst({
      where: { projectId: project.id, name: ev.name },
    })
    if (!event) {
      event = await db.event.create({
        data: {
          projectId: project.id,
          name: ev.name,
          trigger: ev.trigger,
          isKeyEvent: ev.isKeyEvent,
          requiresDataLayer: ev.requiresDataLayer,
        },
      })
      eventsCreated++
    } else {
      eventsSkipped++
    }

    // Link parameters
    for (const paramName of ev.parameters) {
      const parameterId = paramMap.get(paramName)
      if (!parameterId) continue
      await db.eventParameter.upsert({
        where: { eventId_parameterId: { eventId: event.id, parameterId } },
        update: {},
        create: { eventId: event.id, parameterId },
      })
    }
  }

  console.log(`    ✓ ${eventsCreated} events created, ${eventsSkipped} skipped`)
}

async function main() {
  console.log('🌱 Seeding database from sheets...\n')

  let sheetsProcessed = 0

  for (const source of SOURCES) {
    process.stdout.write(`Loading ${source.label}... `)

    let rows: string[][] | null = null

    // 1. Local XLSX
    if (source.localXlsx) {
      const filePath = path.resolve(source.localXlsx)
      if (fs.existsSync(filePath)) {
        rows = readXlsx(filePath)
        process.stdout.write(`(xlsx) `)
      }
    }

    // 2. Local CSV
    if (!rows && source.localFile) {
      const filePath = path.resolve(source.localFile)
      if (fs.existsSync(filePath)) {
        const csv = fs.readFileSync(filePath, 'utf8')
        rows = parseCsv(csv)
        process.stdout.write(`(local) `)
      }
    }

    // 3. Web fetch
    if (!rows && source.sheetId) {
      const csv = await fetchSheetCsv(source.sheetId)
      if (csv) {
        rows = parseCsv(csv)
      }
    }

    if (!rows) continue

    const data = parseSheet(rows)
    if (!data) {
      console.log(`⚠ Could not parse`)
      continue
    }

    console.log(`→ ${data.clientName} (${data.events.length} events)`)
    await seedSheet(data)
    sheetsProcessed++
  }

  console.log(`\n✅ Done — ${sheetsProcessed} sheets seeded.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
