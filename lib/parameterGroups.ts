/**
 * Predefined parameter groups that can be applied to an event in one click.
 * Each entry describes a set of parameters that will be upserted at the
 * project level and attached to the event.
 */

export interface GroupParam {
  name: string
  type: 'string' | 'int' | 'float' | 'boolean'
  description: string
  requiresGA4Registration: boolean
}

export interface ParameterGroup {
  key: string
  label: string
  description: string
  docsUrl: string
  parameters: GroupParam[]
}

export const PARAMETER_GROUPS: ParameterGroup[] = [
  {
    key: 'ecommerce',
    label: 'GA4 Ecommerce',
    description: 'Standard event-level and items array parameters for GA4 ecommerce tracking (GTM)',
    docsUrl: 'https://developers.google.com/analytics/devguides/collection/ga4/ecommerce?client_type=gtm',
    parameters: [
      // ── Core purchase parameters ─────────────────────────────────────────
      // These are natively used in GA4's revenue / ecommerce reports and
      // do not need a separate custom dimension registration.
      {
        name: 'currency',
        type: 'string',
        description: 'Currency code (ISO 4217), e.g. AUD, USD. Required for meaningful revenue data.',
        requiresGA4Registration: false,
      },
      {
        name: 'value',
        type: 'float',
        description: 'Monetary value of the event. Used in revenue reporting.',
        requiresGA4Registration: false,
      },
      {
        name: 'transaction_id',
        type: 'string',
        description: 'Unique identifier for the transaction. Required on purchase and refund events to prevent duplicate counting.',
        requiresGA4Registration: false,
      },
      {
        name: 'tax',
        type: 'float',
        description: 'Tax cost associated with the transaction (purchase / refund).',
        requiresGA4Registration: false,
      },
      {
        name: 'shipping',
        type: 'float',
        description: 'Shipping cost associated with the transaction (purchase / refund).',
        requiresGA4Registration: false,
      },

      // ── Checkout & engagement parameters ────────────────────────────────
      // Register as custom dimensions to use in custom reports / Explorations.
      {
        name: 'coupon',
        type: 'string',
        description: 'Coupon code applied to the event (begin_checkout, add_payment_info, add_shipping_info, purchase, refund).',
        requiresGA4Registration: true,
      },
      {
        name: 'shipping_tier',
        type: 'string',
        description: 'Shipping tier selected by the user, e.g. Ground, Air, Next-day (add_shipping_info).',
        requiresGA4Registration: true,
      },
      {
        name: 'payment_type',
        type: 'string',
        description: 'Payment method selected, e.g. Credit Card, Debit Card, PayPal (add_payment_info).',
        requiresGA4Registration: true,
      },

      // ── Item list parameters (event-level) ──────────────────────────────
      {
        name: 'item_list_id',
        type: 'string',
        description: 'ID of the list in which the item was presented to the user (view_item_list, select_item).',
        requiresGA4Registration: true,
      },
      {
        name: 'item_list_name',
        type: 'string',
        description: 'Name of the list in which the item was presented to the user (view_item_list, select_item).',
        requiresGA4Registration: true,
      },

      // ── Items array parameters ────────────────────────────────────────────
      // These are the parameters inside the items array pushed to the data layer.
      // GA4 recognises them natively — no custom dimension registration needed.
      {
        name: 'item_id',
        type: 'string',
        description: 'Unique identifier for the item (SKU / product ID).',
        requiresGA4Registration: false,
      },
      {
        name: 'item_name',
        type: 'string',
        description: 'Name of the item.',
        requiresGA4Registration: false,
      },
      {
        name: 'affiliation',
        type: 'string',
        description: 'Store or affiliate from which the item was purchased.',
        requiresGA4Registration: false,
      },
      {
        name: 'discount',
        type: 'float',
        description: 'Monetary discount value associated with the item.',
        requiresGA4Registration: false,
      },
      {
        name: 'index',
        type: 'int',
        description: 'Index / position of the item in a list.',
        requiresGA4Registration: false,
      },
      {
        name: 'item_brand',
        type: 'string',
        description: 'Brand of the item.',
        requiresGA4Registration: false,
      },
      {
        name: 'item_category',
        type: 'string',
        description: 'Category of the item. Use item_category2–5 for additional levels.',
        requiresGA4Registration: false,
      },
      {
        name: 'item_category2',
        type: 'string',
        description: 'Second category hierarchy level for the item.',
        requiresGA4Registration: false,
      },
      {
        name: 'item_category3',
        type: 'string',
        description: 'Third category hierarchy level for the item.',
        requiresGA4Registration: false,
      },
      {
        name: 'item_category4',
        type: 'string',
        description: 'Fourth category hierarchy level for the item.',
        requiresGA4Registration: false,
      },
      {
        name: 'item_category5',
        type: 'string',
        description: 'Fifth category hierarchy level for the item.',
        requiresGA4Registration: false,
      },
      {
        name: 'item_variant',
        type: 'string',
        description: 'Variant of the item (e.g. size, colour).',
        requiresGA4Registration: false,
      },
      {
        name: 'location_id',
        type: 'string',
        description: 'Physical or virtual location associated with the item (e.g. store ID).',
        requiresGA4Registration: false,
      },
      {
        name: 'price',
        type: 'float',
        description: 'Monetary price of the item, in units of the specified currency.',
        requiresGA4Registration: false,
      },
      {
        name: 'quantity',
        type: 'int',
        description: 'Quantity of the item.',
        requiresGA4Registration: false,
      },
    ],
  },
]

export const PARAMETER_GROUPS_BY_KEY = Object.fromEntries(
  PARAMETER_GROUPS.map((g) => [g.key, g])
) as Record<string, ParameterGroup>
