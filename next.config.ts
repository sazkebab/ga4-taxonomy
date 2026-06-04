import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  typescript: {
    // Type checking runs separately in CI — skip during build to save memory
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [
    'better-sqlite3',
    '@prisma/adapter-better-sqlite3',
    '@google-analytics/data',
    '@google-analytics/admin',
    'googleapis',
    'google-auth-library',
    'docx',
    '@anthropic-ai/sdk',
    'pdf-parse',
    '@nivo/sunburst',
    '@nivo/core',
  ],
}

export default nextConfig
