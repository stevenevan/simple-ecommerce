import { rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { request as playwrightRequest, type FullConfig } from '@playwright/test'
import { SEED_PRODUCTS } from './seed'

// SCHEMA mirrors lib/db/migrate.ts. Inlined here because importing the app
// module from Playwright's CJS loader trips on `import.meta.main` / mixed ESM.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  price_cents  INTEGER NOT NULL,
  image_url    TEXT NOT NULL,
  category     TEXT NOT NULL,
  stock        INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS carts (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER UNIQUE NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         INTEGER PRIMARY KEY,
  cart_id    INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  UNIQUE(cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  total_cents      INTEGER NOT NULL,
  shipping_name    TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  shipping_city    TEXT NOT NULL,
  shipping_zip     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'confirmed',
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id                   INTEGER PRIMARY KEY,
  order_id             INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id           INTEGER NOT NULL REFERENCES products(id),
  name_snapshot        TEXT NOT NULL,
  price_cents_snapshot INTEGER NOT NULL,
  quantity             INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_products_category   ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_created    ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart     ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items(order_id);
`

export default async function globalSetup(config: FullConfig) {
  const sqlitePath = process.env.SQLITE_PATH
  if (!sqlitePath || !sqlitePath.endsWith('test.db')) {
    throw new Error(
      `refusing to run tests without SQLITE_PATH=*/test.db (got: ${String(sqlitePath)})`,
    )
  }

  const abs = path.resolve(sqlitePath)
  for (const suffix of ['', '-shm', '-wal']) {
    rmSync(`${abs}${suffix}`, { force: true })
  }
  mkdirSync(path.dirname(abs), { recursive: true })

  const db = new Database(abs)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.exec(SCHEMA_SQL)

  const insert = db.prepare(`
    INSERT INTO products (id, slug, name, description, price_cents, image_url, category, stock)
    VALUES (@id, @slug, @name, @description, @price_cents, @image_url, @category, @stock)
  `)
  const txn = db.transaction((rows: typeof SEED_PRODUCTS) => {
    for (const r of rows) insert.run(r)
  })
  txn(SEED_PRODUCTS)

  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()

  const baseURL =
    config.projects.find((p) => p.use?.baseURL)?.use.baseURL ?? 'http://localhost:3000'
  const ctx = await playwrightRequest.newContext({ baseURL })
  for (const url of ['/api/products', '/api/auth/me', '/api/cart']) {
    await ctx.get(url).catch(() => undefined)
  }
  await ctx.dispose()
}
