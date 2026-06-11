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
    // Resolve ecommerce object
    let ecommerceObj: Record<string, unknown>
    if (ecommerceJson) {
      try { ecommerceObj = JSON.parse(ecommerceJson) }
      catch { ecommerceObj = getDefaultEcommerceObj(eventName) }
    } else {
      ecommerceObj = getDefaultEcommerceObj(eventName)
    }

    // Embed as indented block: `  ecommerce: { ... }`
    const formatted = JSON.stringify(ecommerceObj, null, 2)
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
 * Lightweight re-indenter for hand-edited dataLayer.push() blocks.
 *
 * Not a full JS formatter — just normalises indentation based on bracket
 * nesting, using the same convention as generateCodeBlock(): a leading run
 * of closing brackets (}, ], )) dedents by one level regardless of how many
 * characters are in the run (so a `});` line only dedents once, matching how
 * `dataLayer.push({ ... })` is indented), and a trailing run of opening
 * brackets ({, [, () indents subsequent lines by one level.
 */
export function reindentCodeBlock(code: string, indent = '  '): string {
  let depth = 0

  return code.split('\n').map((rawLine) => {
    const line = rawLine.trim()
    if (line === '') return ''

    const leadingClose = '}])'.includes(line[0])
    const lineDepth = Math.max(0, depth - (leadingClose ? 1 : 0))
    const formatted = indent.repeat(lineDepth) + line
    depth = lineDepth

    if ('{[('.includes(line[line.length - 1])) depth += 1

    return formatted
  }).join('\n')
}
