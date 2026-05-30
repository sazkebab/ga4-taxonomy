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
