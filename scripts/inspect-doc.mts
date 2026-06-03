/**
 * Fetches a Google Doc and prints its structural elements so we can
 * see exactly what heading levels and paragraph styles are used.
 * Run: DATABASE_URL="file:./dev.db" npx tsx scripts/inspect-doc.mts
 */
import { google } from 'googleapis'
import { db } from '../lib/db.js'

async function main() {
  // Get first user's Google token
  const account = await db.account.findFirst({ where: { provider: 'google' } })
  if (!account?.access_token) { console.log('No Google token found'); return }

  const gAuth = new google.auth.OAuth2()
  gAuth.setCredentials({ access_token: account.access_token })
  const docs = google.docs({ version: 'v1', auth: gAuth })

  const docId = '1MzMygYhJamvscysx613UHzlj3oH5R3t_sB9SjXxvDEM'
  const result = await docs.documents.get({ documentId: docId })
  const body = result.data.body?.content ?? []

  console.log('\n=== DOCUMENT STRUCTURE ===\n')

  for (const el of body) {
    if (el.paragraph) {
      const style = el.paragraph.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT'
      const text = (el.paragraph.elements ?? [])
        .map(e => e.textRun?.content ?? '').join('').replace(/\n$/, '').trim()

      if (!text) continue

      // Show font info for normal text
      const fonts = (el.paragraph.elements ?? []).map(e => {
        const f = e.textRun?.textStyle?.weightedFontFamily?.fontFamily
        return f ? `[${f}]` : ''
      }).filter(Boolean).join('')

      if (style !== 'NORMAL_TEXT') {
        console.log(`${style}: "${text}"`)
      } else if (text.length < 120) {
        console.log(`  text${fonts}: "${text.slice(0, 80)}"`)
      }
    }
    if (el.table) {
      const rows = el.table.tableRows?.length ?? 0
      const cols = el.table.tableRows?.[0]?.tableCells?.length ?? 0
      const firstCell = (el.table.tableRows?.[0]?.tableCells?.[0]?.content ?? [])
        .flatMap(c => c.paragraph?.elements ?? [])
        .map(e => e.textRun?.content ?? '').join('').trim().slice(0, 60)
      console.log(`  TABLE(${rows}x${cols}): "${firstCell}"`)
    }
  }

  await db.$disconnect()
}

main().catch(console.error)
