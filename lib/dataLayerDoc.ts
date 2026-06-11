/**
 * Utility for generating dataLayer.push() code blocks from event + parameter data.
 * Pure function — no external dependencies.
 *
 * Naming convention:
 *   - When a category is set: event name in push is `custom.<category>.<eventName>`
 *   - An `action` property is always added (value = bare event name) when a category is set
 *   - For the "ecommerce" category: prepends `dataLayer.push({ ecommerce: null })` and
 *     appends an `ecommerce: { ... }` object following the GA4 spec
 */

export interface ParamForBlock {
  name:    string
  example: string
  type:    string
  value?:  string   // "dynamic" (use example/placeholder) or a constant to embed verbatim
}

export interface CodeBlockOptions {
  category?:      string   // e.g. "ecommerce" | "search" | "form"
  ecommerceJson?: string   // JSON string of the ecommerce object (overrides default)
}

// ─── Auto-category detection ─────────────────────────────────────────────────

const GA4_ECOMMERCE_EVENTS = new Set([
  'view_item_list', 'select_item', 'view_item',
  'add_to_cart', 'remove_from_cart', 'view_cart',
  'begin_checkout', 'add_shipping_info', 'add_payment_info',
  'purchase', 'refund', 'view_promotion', 'select_promotion',
])

/**
 * Infers a category from an event name:
 *  - Known GA4 ecommerce events → "ecommerce"
 *  - Contains "search"          → "search"
 *  - Contains "form"            → "form"
 *  - Otherwise                  → ""
 */
export function detectCategory(eventName: string): string {
  if (GA4_ECOMMERCE_EVENTS.has(eventName)) return 'ecommerce'
  if (eventName.includes('search')) return 'search'
  if (eventName.includes('form'))   return 'form'
  return ''
}

// ─── GA4 ecommerce defaults ───────────────────────────────────────────────────

const ITEMS_TEMPLATE = {
  item_id:        '<item_id>',
  item_name:      '<item_name>',
  affiliation:    '<affiliation>',
  coupon:         '<coupon>',
  discount:       0.0,
  index:          0,
  item_brand:     '<item_brand>',
  item_category:  '<item_category>',
  item_variant:   '<item_variant>',
  price:          0.0,
  quantity:       1,
}

function getDefaultEcommerceObj(eventName: string): Record<string, unknown> {
  const items = [ITEMS_TEMPLATE]

  switch (eventName) {
    case 'view_item_list':
    case 'select_item':
      return { item_list_id: '<item_list_id>', item_list_name: '<item_list_name>', items }

    case 'view_item':
    case 'add_to_cart':
    case 'remove_from_cart':
    case 'view_cart':
      return { currency: '<currency>', value: 0.0, items }

    case 'begin_checkout':
      return { currency: '<currency>', value: 0.0, coupon: '<coupon>', items }

    case 'add_shipping_info':
      return { currency: '<currency>', value: 0.0, coupon: '<coupon>', shipping_tier: '<shipping_tier>', items }

    case 'add_payment_info':
      return { currency: '<currency>', value: 0.0, coupon: '<coupon>', payment_type: '<payment_type>', items }

    case 'purchase':
      return { transaction_id: '<transaction_id>', value: 0.0, tax: 0.0, shipping: 0.0, currency: '<currency>', coupon: '<coupon>', items }

    case 'refund':
      return { transaction_id: '<transaction_id>', value: 0.0, tax: 0.0, shipping: 0.0, currency: '<currency>', coupon: '<coupon>', items }

    case 'view_promotion':
    case 'select_promotion':
      return { creative_name: '<creative_name>', creative_slot: '<creative_slot>', promotion_id: '<promotion_id>', promotion_name: '<promotion_name>', items }

    default:
      return { currency: '<currency>', value: 0.0, items }
  }
}

/** Returns the default ecommerce JSON string for an event name (for storage). */
export function getDefaultEcommerceJson(eventName: string): string {
  return JSON.stringify(getDefaultEcommerceObj(eventName), null, 2)
}

// ─── Code block generation ────────────────────────────────────────────────────

/** Returns a formatted `dataLayer.push({...});` string. */
export function generateCodeBlock(
  eventName:  string,
  parameters: ParamForBlock[],
  options:    CodeBlockOptions = {}
): string {
  const { category = '', ecommerceJson = '' } = options
  const cat          = category ?? ''
  const hasCategory  = Boolean(cat)
  const isEcommerce  = cat.toLowerCase() === 'ecommerce'
  const fullName     = hasCategory ? `custom.${cat}.${eventName}` : eventName
  const placeholder = (type: string): string => {
    if (type === 'int')     return '0'
    if (type === 'float')   return '0.0'
    if (type === 'boolean') return 'false'
    return "'<value>'"
  }

  // Skip any 'action' param from the explicit list — we always add it automatically
  const filteredParams = parameters.filter((p) => p.name !== 'action')

  const paramLines = filteredParams.map((p) => {
    let val: string
    const constant = p.value && p.value !== 'dynamic' ? p.value : null
    if (constant) {
      val = p.type === 'string' ? `'${constant}'` : constant
    } else if (p.example) {
      val = p.type === 'string' ? `'${p.example}'` : p.example
    } else {
      val = placeholder(p.type)
    }
    return `  ${p.name}: ${val},`
  })

  if (isEcommerce) {
    // The ecommerce object doesn't need to be strict JSON — it's embedded
    // verbatim (re-indented to match the surrounding code block), so it can
    // contain unquoted keys, <placeholder> values, `true/false` unions, etc.
    const raw = (ecommerceJson || getDefaultEcommerceJson(eventName)).trim()

    // Embed as indented block: `  ecommerce: { ... }`
    const formatted = reindentCodeBlock(raw)
    const embedded  = formatted
      .split('\n')
      .map((line, i) => (i === 0 ? `  ecommerce: ${line}` : `  ${line}`))
      .join('\n')

    const lines = [
      `  event: '${fullName}',`,
      `  action: '${eventName}',`,
      ...paramLines,
      `${embedded},`,
    ]

    return `dataLayer.push({ ecommerce: null });\ndataLayer.push({\n${lines.join('\n')}\n});`
  }

  const lines = [
    `  event: '${fullName}',`,
    ...(hasCategory ? [`  action: '${eventName}',`] : []),
    ...paramLines,
  ]

  return `dataLayer.push({\n${lines.join('\n')}\n});`
}

// ─── Re-indentation ────────────────────────────────────────────────────────────

/**
 * Lightweight re-indenter for hand-edited dataLayer.push() blocks (and
 * standalone ecommerce objects).
 *
 * Not a full JS formatter — just normalises indentation based on bracket
 * nesting. Each line's leading run of closing brackets (}, ], )) dedents by
 * one level per `}`/`]` (so `}]` — closing an item object inside an `items`
 * array on one line — dedents by two), while `(` and `)` are treated as
 * "hugging" an adjacent {}/[] and never add their own level — this matches
 * how `dataLayer.push({ ... })` / `});` are indented (one level, not two).
 * Symmetrically, a trailing run of opening brackets ({, [, () indents
 * subsequent lines by one level per `{`/`[`.
 */
export function reindentCodeBlock(code: string, indent = '  '): string {
  let depth = 0
  const countOpeners = (s: string) => (s.match(/[{[]/g) ?? []).length
  const countClosers = (s: string) => (s.match(/[}\]]/g) ?? []).length

  return code.split('\n').map((rawLine) => {
    const line = rawLine.trim()
    if (line === '') return ''

    // Leading run of }, ], ) — dedent by the number of }/] in it.
    let lead = 0
    while (lead < line.length && '}])'.includes(line[lead])) lead++
    const dedent = countClosers(line.slice(0, lead))

    const lineDepth = Math.max(0, depth - dedent)
    const formatted = indent.repeat(lineDepth) + line
    depth = lineDepth

    // Trailing run of {, [, ( — indent by the number of {/[ in it.
    let trail = line.length
    while (trail > 0 && '{[('.includes(line[trail - 1])) trail--
    depth += countOpeners(line.slice(trail))

    return formatted
  }).join('\n')
}

// ─── Lenient parsing for hand-edited ecommerce objects ────────────────────────

/**
 * Checks that {}, [], () are balanced and properly nested, ignoring any
 * brackets inside '...'/"..."/`...` string literals. Used as a lightweight
 * "this looks structurally sound" gate for hand-edited ecommerce objects
 * that aren't required to be strict JSON.
 */
export function hasBalancedBrackets(text: string): boolean {
  const stack: string[] = []
  const closers: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  let quote: string | null = null

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = null
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }

    if (ch === '{' || ch === '[' || ch === '(') stack.push(ch)
    else if (ch === '}' || ch === ']' || ch === ')') {
      if (stack.pop() !== closers[ch]) return false
    }
  }

  return stack.length === 0 && quote === null
}

/**
 * Parses "ecommerce object" text that doesn't need to be strict JSON.
 *
 * Tries JSON.parse() first (covers the auto-generated defaults, which are
 * already valid JSON). If that fails, normalises common JS-object-literal
 * conventions — unquoted keys, bare <placeholder> tokens, `true/false`
 * placeholder unions, and trailing commas — into valid JSON and tries again.
 * Returns null if it still can't be parsed.
 *
 * Used for things that need to introspect the object's shape (e.g. the
 * ecommerce fields table) — the raw text itself (not this parsed result) is
 * what gets embedded into generated code blocks, so placeholder syntax is
 * preserved verbatim there.
 */
export function lenientJsonParse(text: string): unknown | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  try { return JSON.parse(trimmed) } catch { /* fall through */ }

  const normalised = trimmed
    // Quote unquoted object keys, e.g. `{ foo:` / `, foo:` → `{ "foo":` / `, "foo":`
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
    // Quote bare <placeholder> tokens that aren't already inside quotes
    .replace(/(?<!")<([^<>"'\n]*)>(?!")/g, '"<$1>"')
    // Quote `true/false`-style placeholder unions
    .replace(/:\s*true\/false\b/g, ': "true/false"')
    // Drop trailing commas before } or ]
    .replace(/,(\s*[}\]])/g, '$1')

  try { return JSON.parse(normalised) } catch { return null }
}
