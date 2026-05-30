import { db } from '../lib/db'
import { slugify } from '../lib/slug'

async function main() {
  const clients = await db.client.findMany()
  for (const c of clients) {
    let slug = slugify(c.name)
    let n = 2
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await db.client.findFirst({ where: { slug, NOT: { id: c.id } } })
      if (!existing) break
      slug = `${slugify(c.name)}-${n++}`
    }
    await db.client.update({ where: { id: c.id }, data: { slug } })
    console.log(`Client: "${c.name}" → "${slug}"`)
  }

  const projects = await db.project.findMany()
  for (const p of projects) {
    let slug = slugify(p.name)
    let n = 2
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await db.project.findFirst({ where: { clientId: p.clientId, slug, NOT: { id: p.id } } })
      if (!existing) break
      slug = `${slugify(p.name)}-${n++}`
    }
    await db.project.update({ where: { id: p.id }, data: { slug } })
    console.log(`Project: "${p.name}" → "${slug}"`)
  }
}

main()
  .then(() => { console.log('Done'); process.exit(0) })
  .catch((e) => { console.error(e); process.exit(1) })
