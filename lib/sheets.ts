import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match?.[1] ?? null
}

export function getSheetsClient(accessToken: string) {
  const authClient = new OAuth2Client()
  authClient.setCredentials({ access_token: accessToken })
  return google.sheets({ version: 'v4', auth: authClient })
}
