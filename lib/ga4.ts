import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { AnalyticsAdminServiceClient } from '@google-analytics/admin'
import { OAuth2Client } from 'google-auth-library'

export function getGA4Clients(accessToken: string) {
  const authClient = new OAuth2Client()
  authClient.setCredentials({ access_token: accessToken })

  const dataClient = new BetaAnalyticsDataClient({ authClient } as never)
  const adminClient = new AnalyticsAdminServiceClient({ authClient } as never)

  return { dataClient, adminClient }
}

/**
 * Fetch the GA4 property's configured currency code (ISO 4217, e.g. "AUD",
 * "GBP", "USD") via the Admin API, so reports can use the property's actual
 * currency instead of assuming one. Falls back to "USD" if no property is
 * configured or the lookup fails (e.g. insufficient permissions).
 */
export async function getPropertyCurrency(accessToken: string, propertyId: string): Promise<string> {
  if (!propertyId) return 'USD'
  try {
    const { adminClient } = getGA4Clients(accessToken)
    const [property] = await adminClient.getProperty({ name: `properties/${propertyId}` })
    return property?.currencyCode || 'USD'
  } catch {
    return 'USD'
  }
}
