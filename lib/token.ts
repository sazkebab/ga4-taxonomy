import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function getGoogleAccessToken(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const account = await db.account.findFirst({
    where: { userId: session.user.id, provider: 'google' },
  })
  if (!account?.access_token) return null

  const isExpired = account.expires_at
    ? account.expires_at * 1000 < Date.now() + 60_000
    : false

  if (!isExpired) return account.access_token

  if (!account.refresh_token) return null

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
    }),
  })

  if (!response.ok) return null

  const tokens = await response.json()

  await db.account.update({
    where: { id: account.id },
    data: {
      access_token: tokens.access_token,
      expires_at: tokens.expires_in
        ? Math.floor(Date.now() / 1000) + tokens.expires_in
        : null,
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    },
  })

  return tokens.access_token
}
