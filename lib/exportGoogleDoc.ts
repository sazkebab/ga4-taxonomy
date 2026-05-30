/**
 * Creates a new Google Doc from DataLayer documentation.
 * Returns the URL of the created document.
 */
import { google } from 'googleapis'
import type { ExportDoc, ExportSection } from './exportDocx'

export { type ExportDoc, type ExportSection }

export async function createGoogleDoc(
  accessToken: string,
  data: ExportDoc
): Promise<string> {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })

  const docs = google.docs({ version: 'v1', auth })

  // Create an empty document first
  const created = await docs.documents.create({
    requestBody: { title: `${data.projectName} — DataLayer Documentation` },
  })

  const docId = created.data.documentId!

  // Build batchUpdate requests
  // We insert content in reverse order (Google Docs inserts at index 1 by default, shifting right)
  // Easier: build a single text blob then apply styles
  const requests: object[] = []

  // Build content bottom-to-top so insertions stay consistent
  let cursor = 1

  function insertText(text: string): { insertText: object } {
    return {
      insertText: {
        location: { index: cursor },
        text,
      },
    }
  }

  // Collect all text segments with their style info
  interface Segment {
    text: string
    style?: {
      bold?: boolean
      italic?: boolean
      fontSize?: number
      foregroundColor?: { red: number; green: number; blue: number }
      weightedFontFamily?: { fontFamily: string }
    }
    paragraphStyle?: {
      namedStyleType?: string
    }
  }

  const segments: Segment[] = []

  segments.push({ text: data.projectName + '\n', paragraphStyle: { namedStyleType: 'HEADING_1' } })

  for (const section of data.sections) {
    segments.push({ text: '\n' })
    segments.push({ text: section.eventName + '\n', paragraphStyle: { namedStyleType: 'HEADING_2' } })

    if (section.trigger) {
      segments.push({ text: 'Trigger: ', style: { bold: true } })
      segments.push({ text: section.trigger + '\n' })
    }

    if (section.codeBlock) {
      segments.push({ text: 'dataLayer.push:\n', style: { bold: true } })
      segments.push({
        text: section.codeBlock + '\n',
        style: { weightedFontFamily: { fontFamily: 'Courier New' } },
      })
    }

    if (section.params.length > 0) {
      segments.push({ text: '\nFields explained:\n', style: { bold: true } })
      segments.push({ text: 'Name | Description | Type | Example | Notes\n', style: { bold: true } })
      for (const p of section.params) {
        segments.push({ text: `${p.name} | ${p.description} | ${p.type} | ${p.example} | ${p.notes}\n` })
      }
    }

    if (section.comments.length > 0) {
      segments.push({ text: '\nComments:\n', style: { bold: true } })
      for (const comment of section.comments) {
        segments.push({ text: `• ${comment}\n`, style: { italic: true } })
      }
    }

    const statusParts = []
    if (section.isDone) statusParts.push('Done')
    if (section.isTested) statusParts.push('Tested')
    if (section.testResult) statusParts.push(section.testResult === 'passed' ? 'Passed ✓' : 'Failed ✗')
    if (statusParts.length > 0) {
      segments.push({ text: `Status: ${statusParts.join(', ')}\n` })
    }
  }

  // Insert all text as one block
  const fullText = segments.map((s) => s.text).join('')
  requests.push({
    insertText: {
      location: { index: 1 },
      text: fullText,
    },
  })

  // Apply paragraph styles by walking through segments to find character ranges
  let idx = 1
  for (const segment of segments) {
    const len = segment.text.length
    if (segment.paragraphStyle?.namedStyleType) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: idx, endIndex: idx + len },
          paragraphStyle: { namedStyleType: segment.paragraphStyle.namedStyleType },
          fields: 'namedStyleType',
        },
      })
    }
    if (segment.style) {
      const textStyle: Record<string, unknown> = {}
      const fields: string[] = []
      if (segment.style.bold !== undefined) { textStyle.bold = segment.style.bold; fields.push('bold') }
      if (segment.style.italic !== undefined) { textStyle.italic = segment.style.italic; fields.push('italic') }
      if (segment.style.weightedFontFamily) { textStyle.weightedFontFamily = segment.style.weightedFontFamily; fields.push('weightedFontFamily') }
      if (segment.style.foregroundColor) { textStyle.foregroundColor = { color: { rgbColor: segment.style.foregroundColor } }; fields.push('foregroundColor') }
      if (fields.length > 0) {
        requests.push({
          updateTextStyle: {
            range: { startIndex: idx, endIndex: idx + len },
            textStyle,
            fields: fields.join(','),
          },
        })
      }
    }
    idx += len
  }

  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests },
    })
  }

  return `https://docs.google.com/document/d/${docId}/edit`
}
