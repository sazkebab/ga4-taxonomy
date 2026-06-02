import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { db } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/analytics.readonly',
            'https://www.googleapis.com/auth/analytics.edit',
            'https://www.googleapis.com/auth/spreadsheets.readonly',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/documents.readonly',
          ].join(' '),
        },
      },
    }),
  ],
  session: {
    strategy: 'database',
  },
  callbacks: {
    async signIn({ account, user }) {
      // When a user re-authenticates via Google, update their stored tokens
      // so scope changes (e.g. adding documents.readonly) take effect immediately
      if (account?.provider === 'google' && account.access_token) {
        await db.account.updateMany({
          where: { userId: user.id, provider: 'google' },
          data: {
            access_token:  account.access_token,
            expires_at:    account.expires_at ?? null,
            scope:         account.scope ?? null,
            ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
          },
        })
      }
      return true
    },
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
})
