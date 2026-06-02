/**
 * GA4 reporting helpers for the analysis agent.
 * Uses the same @google-analytics/data package as GA4 sync,
 * but with generic reporting capabilities.
 */
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { google } from 'googleapis'

function buildClient(accessToken: string): BetaAnalyticsDataClient {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return new BetaAnalyticsDataClient({ authClient: auth as never })
}

type DateRange = { start_date: string; end_date: string }

export async function runReport(
  accessToken: string,
  propertyId: string,
  dimensions: string[],
  metrics: string[],
  dateRanges: DateRange[],
  limit = 100,
): Promise<Record<string, string>[]> {
  const client = buildClient(accessToken)
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    dateRanges: dateRanges.map((dr) => ({
      startDate: dr.start_date,
      endDate: dr.end_date,
    })),
    limit,
  })

  const dimHeaders = (response.dimensionHeaders ?? []).map((h) => h.name ?? '')
  const metHeaders = (response.metricHeaders ?? []).map((h) => h.name ?? '')

  return (response.rows ?? []).map((row) => {
    const record: Record<string, string> = {}
    ;(row.dimensionValues ?? []).forEach((v, i) => { record[dimHeaders[i]] = v.value ?? '' })
    ;(row.metricValues ?? []).forEach((v, i) => { record[metHeaders[i]] = v.value ?? '' })
    return record
  })
}

export async function getTopEvents(
  accessToken: string,
  propertyId: string,
  dateRange: DateRange,
): Promise<Record<string, string>[]> {
  return runReport(
    accessToken, propertyId,
    ['eventName'],
    ['eventCount', 'eventCountPerUser', 'totalUsers'],
    [dateRange],
    30,
  )
}

export async function getPagePerformance(
  accessToken: string,
  propertyId: string,
  dateRange: DateRange,
  limit = 25,
): Promise<Record<string, string>[]> {
  return runReport(
    accessToken, propertyId,
    ['pagePath', 'pageTitle'],
    ['screenPageViews', 'averageSessionDuration', 'bounceRate', 'conversions'],
    [dateRange],
    limit,
  )
}

export async function getConversionTrend(
  accessToken: string,
  propertyId: string,
  dateRanges: DateRange[],
): Promise<Record<string, string>[]> {
  return runReport(
    accessToken, propertyId,
    ['date'],
    ['sessions', 'conversions', 'totalRevenue', 'purchaseRevenue'],
    dateRanges,
    500,
  )
}

export async function getFunnelData(
  accessToken: string,
  propertyId: string,
  steps: { name: string; event: string }[],
  dateRange: DateRange,
): Promise<{ step: string; event: string; users: string }[]> {
  // Query all events once and filter per step
  const rows = await runReport(
    accessToken, propertyId,
    ['eventName'],
    ['eventCount', 'totalUsers'],
    [dateRange],
    200,
  )
  return steps.map((step) => {
    const match = rows.find((r) => r.eventName === step.event)
    return { step: step.name, event: step.event, users: match?.totalUsers ?? '0' }
  })
}
