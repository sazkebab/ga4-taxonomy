/**
 * Usage: npx tsx scripts/make-admin.ts <email>
 * Makes a user a super admin by email.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const email = process.argv[2]
if (!email) {
  console.error('Usage: npx tsx scripts/make-admin.ts <email>')
  process.exit(1)
}

const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' })
const db = new PrismaClient({ adapter })

async function main() {
  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    console.error(`No user found with email: ${email}`)
    console.error('The user must have signed in at least once before being promoted.')
    process.exit(1)
  }

  await db.user.update({ where: { email }, data: { isSuperAdmin: true } })
  console.log(`✅ ${user.name ?? email} is now a super admin.`)
}

main().finally(() => db.$disconnect())
