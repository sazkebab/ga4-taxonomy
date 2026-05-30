/**
 * Parses a GTM container export JSON and extracts GA4 event tags.
 *
 * GTM container exports have this shape:
 *   { containerVersion: { container, tag[], trigger[], variable[] } }
 *
 * GA4 Event tags have type "gaawe". Each tag's `parameter` array contains:
 *   - { key: "eventName", value: "purchase" }          ← the GA4 event name
 *   - { key: "eventParameters", list: [ MAP... ] }     ← event parameters
 *
 * Each MAP entry in the eventParameters list has:
 *   - { key: "name",  value: "transaction_id" }   ← GA4 parameter name
 *   - { key: "value", value: "{{DL - ...}}" }     ← GTM variable reference
 */

// ─── Raw GTM types ─────────────────────────────────────────────────────────────

interface RawParam {
  type: string
  key?: string
  value?: string
  list?: RawParam[]
  map?: RawParam[]
}

interface RawTag {
  tagId: string
  name: string
  type: string
  parameter?: RawParam[]
  firingTriggerId?: string[]
}

interface RawTrigger {
  triggerId: string
  name: string
}

interface RawContainer {
  name?: string
  publicId?: string
}

interface RawContainerVersion {
  container?: RawContainer
  tag?: RawTag[]
  trigger?: RawTrigger[]
}

interface RawExport {
  containerVersion?: RawContainerVersion
}

// ─── Output types ──────────────────────────────────────────────────────────────

/** Maps a GTM param type string to our app's parameter type */
function mapGtmType(gtmType: string): string {
  switch (gtmType?.toUpperCase()) {
    case 'INTEGER': return 'number'
    case 'BOOLEAN': return 'boolean'
    default:        return 'string'   // TEMPLATE, TAG_REFERENCE, etc.
  }
}

export interface GTMParsedParam {
  name: string      // GA4 parameter name, e.g. "transaction_id"
  gtmValue: string  // GTM variable reference, e.g. "{{DL - transaction_id}}"
  type: string      // 'string' | 'number' | 'boolean'
}

export interface GTMParsedEvent {
  tagId: string
  tagName: string       // GTM tag name
  eventName: string     // GA4 event name
  isVariableName: boolean  // true when eventName is a {{variable}} reference
  parameters: GTMParsedParam[]
  triggerNames: string[]
}

export interface GTMParseResult {
  containerName: string
  publicId: string
  events: GTMParsedEvent[]
  skippedTagCount: number  // non-GA4 tags ignored
}

// ─── Parser ────────────────────────────────────────────────────────────────────

export function parseGTMExport(raw: unknown): GTMParseResult {
  const json = raw as RawExport

  const cv = json?.containerVersion
  if (!cv) throw new Error('Not a valid GTM container export — missing containerVersion')

  const tags = cv.tag ?? []
  const triggers = cv.trigger ?? []
  const container = cv.container ?? {}

  if (tags.length === 0 && triggers.length === 0) {
    throw new Error('Container appears to be empty — no tags or triggers found')
  }

  // Build trigger id → name lookup
  const triggerMap = new Map<string, string>(
    triggers.map((t) => [t.triggerId, t.name])
  )

  const events: GTMParsedEvent[] = []
  let skippedTagCount = 0

  for (const tag of tags) {
    // Only process GA4 Event tags ("gaawe" = Google Analytics: GA4 Event)
    if (tag.type !== 'gaawe') {
      skippedTagCount++
      continue
    }

    const params = tag.parameter ?? []

    // ── Event name ─────────────────────────────────────────────────────────
    const eventNameEntry = params.find((p) => p.key === 'eventName')
    const eventName = eventNameEntry?.value ?? ''
    if (!eventName) {
      skippedTagCount++
      continue
    }

    const isVariableName = eventName.startsWith('{{') && eventName.endsWith('}}')

    // ── Event parameters ───────────────────────────────────────────────────
    // GTM stores event params in `eventSettingsTable` (MAP list) where each MAP has:
    //   { key: "parameter", value: "<ga4_param_name>" }  ← the param name
    //   { key: "value",     value: "{{DL - ...}}" }      ← the GTM variable (type field = data type)
    // Fallback to legacy `eventParameters` key if eventSettingsTable is absent.
    const settingsEntry =
      params.find((p) => p.key === 'eventSettingsTable') ??
      params.find((p) => p.key === 'eventParameters')

    const parsedParams: GTMParsedParam[] = []

    if (settingsEntry?.list) {
      for (const item of settingsEntry.list) {
        if (item.type !== 'MAP' || !item.map) continue

        // eventSettingsTable uses key "parameter"; eventParameters uses key "name"
        const nameEntry  = item.map.find((m) => m.key === 'parameter') ??
                           item.map.find((m) => m.key === 'name')
        const valueEntry = item.map.find((m) => m.key === 'value')
        const paramName  = nameEntry?.value ?? ''

        // Skip if the parameter name is itself a variable reference
        if (!paramName || paramName.startsWith('{{')) continue

        parsedParams.push({
          name:     paramName,
          gtmValue: valueEntry?.value ?? '',
          type:     mapGtmType(valueEntry?.type ?? 'TEMPLATE'),
        })
      }
    }

    // ── Trigger names ──────────────────────────────────────────────────────
    const triggerNames = (tag.firingTriggerId ?? []).map(
      (id) => triggerMap.get(id) ?? `Trigger ${id}`
    )

    events.push({
      tagId: tag.tagId,
      tagName: tag.name,
      eventName,
      isVariableName,
      parameters: parsedParams,
      triggerNames,
    })
  }

  return {
    containerName: container.name ?? 'GTM Container',
    publicId: container.publicId ?? '',
    events,
    skippedTagCount,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Merges tags that share the same eventName into one entry.
 * Useful for the preview UI so the user sees one row per GA4 event
 * rather than one row per GTM tag.
 */
export interface GTMGroupedParam {
  name: string
  type: string  // 'string' | 'number' | 'boolean'
}

export interface GTMGroupedEvent {
  eventName: string
  isVariableName: boolean
  tagNames: string[]
  parameters: GTMGroupedParam[]  // deduped; first-seen type wins on collision
  triggerNames: string[]
}

export function groupEventsByName(events: GTMParsedEvent[]): GTMGroupedEvent[] {
  const map = new Map<string, GTMGroupedEvent>()

  for (const e of events) {
    const existing = map.get(e.eventName)
    if (existing) {
      existing.tagNames.push(e.tagName)
      for (const p of e.parameters) {
        if (!existing.parameters.some((ep) => ep.name === p.name)) {
          existing.parameters.push({ name: p.name, type: p.type })
        }
      }
      for (const t of e.triggerNames) {
        if (!existing.triggerNames.includes(t)) existing.triggerNames.push(t)
      }
    } else {
      map.set(e.eventName, {
        eventName:     e.eventName,
        isVariableName: e.isVariableName,
        tagNames:      [e.tagName],
        parameters:    e.parameters.map((p) => ({ name: p.name, type: p.type })),
        triggerNames:  [...e.triggerNames],
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => a.eventName.localeCompare(b.eventName))
}
