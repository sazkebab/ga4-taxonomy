/**
 * BigQuery-based journey data fetching.
 *
 * Reads a wide-format table where each row is a unique user path through the site:
 *   page_1  STRING   — first page in the session (landing page)
 *   page_2  STRING   — second page (NULL if session ended earlier)
 *   ...
 *   page_8  STRING   — eighth page
 *   users   INTEGER  — number of sessions that followed this exact path
 *
 * See JourneySettings for the BigQuery SQL to create this table.
 */
import { google } from 'googleapis'
import { JourneyTransitions } from '@/lib/journeyData'

/** Normalise a path: strip query string, collapse trailing slash (except root) */
function norm(p: string): string {
  const s = (p || '/').split('?')[0].split('#')[0].toLowerCase() || '/'
  return s !== '/' && s.endsWith('/') ? s.slice(0, -1) : s
}

const PAGE_COLS = ['page_1','page_2','page_3','page_4','page_5','page_6','page_7','page_8']

export async function fetchJourneyFromBigQuery(
  accessToken: string,
  tableId:     string,
  minUsers     = 5,
): Promise<JourneyTransitions> {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const bq = google.bigquery({ version: 'v2', auth })

  const projectId = tableId.split('.')[0]
  if (!projectId) throw new Error('Invalid BigQuery table path — expected project.dataset.table')

  const query = `
    SELECT page_1, page_2, page_3, page_4, page_5, page_6, page_7, page_8, users
    FROM \`${tableId}\`
    WHERE users >= ${minUsers}
    ORDER BY users DESC
    LIMIT 50000
  `

  const res = await bq.jobs.query({
    projectId,
    requestBody: { query, useLegacySql: false, timeoutMs: 30000 },
  })

  // Map column names to indices
  const fields   = (res.data.schema?.fields ?? []).map((f) => f.name ?? '')
  const colIndex = (name: string) => fields.indexOf(name)
  const pageIdxs = PAGE_COLS.map(colIndex)
  const usersIdx = colIndex('users')

  const landingPages = new Map<string, number>()
  const edges        = new Map<string, Map<string, number>>()

  for (const row of res.data.rows ?? []) {
    const vals  = row.f ?? []
    const users = parseInt(String(vals[usersIdx]?.v ?? '0'), 10)
    if (users <= 0) continue

    // Extract and normalise the path for this row (stop at first NULL)
    const path: string[] = []
    for (const idx of pageIdxs) {
      const v = String(vals[idx]?.v ?? '')
      if (!v || v === 'null' || v === '(not set)') break
      path.push(norm(v))
    }
    if (path.length === 0) continue

    // page_1 = landing page
    landingPages.set(path[0], (landingPages.get(path[0]) ?? 0) + users)

    // Each consecutive pair = an edge
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i]
      const to   = path[i + 1]
      if (!edges.has(from)) edges.set(from, new Map())
      edges.get(from)!.set(to, (edges.get(from)!.get(to) ?? 0) + users)
    }

    // Last page in path = exit — add an "(exit)" edge so it shows in the sunburst
    const exitPage = path[path.length - 1]
    if (!edges.has(exitPage)) edges.set(exitPage, new Map())
    edges.get(exitPage)!.set('(exit)', (edges.get(exitPage)!.get('(exit)') ?? 0) + users)
  }

  return { landingPages, edges }
}
