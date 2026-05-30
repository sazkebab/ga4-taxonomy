import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  serverExternalPackages: [
    'better-sqlite3',
    '@prisma/adapter-better-sqlite3',
    '@google-analytics/data',
    '@google-analytics/admin',
    'googleapis',
    'google-auth-library',
    'docx',
  ],
}

export default nextConfig
