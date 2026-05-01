import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { getDb } from './index.ts'
import { runMigrations } from './migrate.ts'

const SLUG_RE = /^[a-z0-9-]+$/
const DEMO_EMAIL = 'demo@example.com'
const DEMO_PASSWORD = 'Demo1234!'
const BCRYPT_COST = 10

type SeedProduct = {
  slug: string
  name: string
  description: string
  price_cents: number
  image_url: string
  category: string
  stock: number
}

export function runSeed(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_SEED) {
    throw new Error('refusing to seed in production (set ALLOW_PROD_SEED=1 to override)')
  }

  const seedPath = path.join(process.cwd(), 'data/seed/products.json')
  const products = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedProduct[]

  for (const p of products) {
    if (!SLUG_RE.test(p.slug)) {
      throw new Error('invalid slug: ' + p.slug)
    }
  }

  const db = getDb()

  const upsertProduct = db.prepare(`
    INSERT INTO products (slug, name, description, price_cents, image_url, category, stock)
    VALUES (@slug, @name, @description, @price_cents, @image_url, @category, @stock)
    ON CONFLICT(slug) DO UPDATE SET
      name         = excluded.name,
      description  = excluded.description,
      price_cents  = excluded.price_cents,
      image_url    = excluded.image_url,
      category     = excluded.category,
      stock        = excluded.stock
  `)

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (email, password_hash, name)
    VALUES (?, ?, 'Demo User')
  `)

  const tx = db.transaction((rows: SeedProduct[]) => {
    for (const row of rows) {
      const imgPath = path.join(process.cwd(), 'public', 'seed-images', `${row.slug}.jpg`)
      const image_url = existsSync(imgPath) ? row.image_url : '/seed-images/missing.jpg'
      if (image_url !== row.image_url) {
        console.warn('missing image: ' + row.slug)
      }
      upsertProduct.run({ ...row, image_url })
    }
    insertUser.run(DEMO_EMAIL, bcrypt.hashSync(DEMO_PASSWORD, BCRYPT_COST))
  })

  tx(products)
  console.log(`seed done: products=${products.length}, users=1`)
}

if (import.meta.main) {
  runMigrations()
  runSeed()
  getDb().close()
}
