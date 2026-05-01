# Week 2 — Database Layer & Catalog API

## Goals

Stand up the SQLite database (schema + indexes), seed it from a local JSON file, and expose the read-side catalog endpoints. End of week: `curl /api/products?...` returns filtered/sorted product rows from a real DB file.

## Dependencies (from prior weeks)

- Wk 1: `better-sqlite3` installed; `lib/api-client.ts` exists; `.gitignore` covers `data/app.db*`.

## Pre-flight reading

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` (for `await params`)

## In-scope tasks

1. **Create `lib/db/index.ts`** — lazy singleton:
   ```ts
   import Database from 'better-sqlite3'
   import path from 'node:path'
   import { mkdirSync } from 'node:fs'

   const DB_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data/app.db')
   mkdirSync(path.dirname(DB_PATH), { recursive: true })

   let _db: Database.Database | null = null
   export function getDb() {
     if (_db) return _db
     _db = new Database(DB_PATH)
     _db.pragma('foreign_keys = ON')
     _db.pragma('journal_mode = WAL')
     return _db
   }
   ```
2. **Create `lib/db/migrate.ts`** — idempotent `CREATE TABLE IF NOT EXISTS` for the six tables in PLAN §3 plus the index block:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_products_category   ON products(category);
   CREATE INDEX IF NOT EXISTS idx_products_created    ON products(created_at);
   CREATE INDEX IF NOT EXISTS idx_cart_items_cart     ON cart_items(cart_id);
   CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
   CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items(order_id);
   ```
   `orders.status` default = `'confirmed'` (no payment integration in demo).
3. **Author `data/seed/products.json`** — array of 20 products across 5 categories (apparel, accessories, home, books, electronics). Each: `slug`, `name`, `description`, `price_cents`, `image_url` (`/seed-images/<slug>.jpg`), `category`, `stock`. Drop matching small CC0 JPGs (~512px, < 50 KB each) into `public/seed-images/`.
4. **Create `lib/db/seed.ts`:**
   - Load `products.json`. For each, `INSERT OR REPLACE INTO products` keyed by `slug`.
   - Insert demo user `demo@example.com` / `Demo1234!` (hash via `bcryptjs.hashSync(pw, 10)`) with `INSERT OR IGNORE`. Creates `name = 'Demo User'`.
   - If `public/seed-images/<slug>.jpg` is missing for a row → console.warn, fall back to `/seed-images/missing.jpg` (do not crash).
5. **Create `lib/db/queries.ts`** — every later route handler imports from this file. **No inline SQL inside route handlers from this sprint forward.** Initial helpers:
   - `listProducts(filter: { category?: string; sort?: SortKey; q?: string; limit: number; offset: number }): Product[]`
   - `getProductBySlug(slug: string): Product | null`
   - `listCategories(): string[]`

   Sort allowlist (concrete constant — non-negotiable):
   ```ts
   export const SORT_COLUMNS = {
     price_asc:  'price_cents ASC',
     price_desc: 'price_cents DESC',
     name_asc:   'name COLLATE NOCASE ASC',
     newest:     'created_at DESC',
   } as const
   export type SortKey = keyof typeof SORT_COLUMNS
   ```
   Unknown sort key → fall back to `newest`. LIKE search uses `?` binding with `%` wrappers added server-side.
6. **Create `lib/types.ts`:**
   ```ts
   export type Product = {
     id: number; slug: string; name: string; description: string;
     price_cents: number; image_url: string; category: string; stock: number;
     created_at: string;
   }
   export type ApiError = { error: string }
   ```
7. **Add scripts to `package.json`:**
   ```json
   "db:migrate": "bun run lib/db/migrate.ts",
   "db:seed":    "bun run lib/db/seed.ts",
   "db:reset":   "rm -f data/app.db data/app.db-* && bun run db:migrate && bun run db:seed"
   ```
8. **Author `app/api/products/route.ts`:**
   - `export const dynamic = 'force-dynamic'` (reads `searchParams`).
   - Parse `request.nextUrl.searchParams`: `category`, `sort`, `q`, `limit` (default 24, hard cap 50), `offset` (default 0).
   - Clamp `limit` server-side: `Math.min(Number(limit) || 24, 50)`.
   - Call `listProducts(...)`, return `Response.json(rows)`.
9. **Author `app/api/products/[slug]/route.ts`:**
   - `export const dynamic = 'force-dynamic'`.
   - `const { slug } = await params` (Next 16 — Promise).
   - `const product = getProductBySlug(slug)`; if null → `Response.json({error:'not_found'}, {status:404})`.

## Out-of-scope

- No homepage UI (Week 3).
- No filters UI (Week 4).
- No cart / order tables used yet — they exist in schema but no endpoints touch them.
- No auth, no session.

## Manual QA checklist

- [ ] `bun run db:reset` creates `data/app.db` (≈ 60-100 KB) without errors. WAL files appear (`-shm`, `-wal`).
- [ ] `sqlite3 data/app.db ".schema"` lists all six tables and the five indexes.
- [ ] `sqlite3 data/app.db "SELECT count(*) FROM products"` → 20.
- [ ] `sqlite3 data/app.db "SELECT email FROM users"` → `demo@example.com`.
- [ ] `curl -s 'http://localhost:3000/api/products?limit=5' | jq length` → 5.
- [ ] `curl -s 'http://localhost:3000/api/products?category=apparel&sort=price_asc' | jq '.[0].price_cents <= .[-1].price_cents'` → `true`.
- [ ] `curl -s 'http://localhost:3000/api/products?q=shirt' | jq 'all(.[] ; .name | ascii_downcase | contains("shirt"))'` → `true`.
- [ ] `curl -s 'http://localhost:3000/api/products?sort=robert%27);DROP%20TABLE--' | jq length` → returns rows (allowlist falls back to `newest`; no SQL injection).
- [ ] `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/products/does-not-exist` → 404.
- [ ] `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/products/<a-real-slug>` → 200.
- [ ] `curl -s 'http://localhost:3000/api/products?limit=999' | jq length` → 20 (cap honoured).

## Exit criteria

- All six tables and five indexes present in `data/app.db`.
- Seed is idempotent (run `bun run db:seed` twice → no duplicate rows, no errors).
- Demo user exists with a `bcryptjs` hash that verifies `Demo1234!`.
- `/api/products` and `/api/products/[slug]` return correct JSON for valid + edge-case queries.
- All SQL flows through `lib/db/queries.ts`.

## Transition to Week 3

The data layer is live and queryable. Week 3 wires the homepage UI to it — TanStack Query against `/api/products`, shadcn product cards, skeleton states, currency formatting. The header shell from Week 1 grows a real layout. No filtering UX yet (that is Week 4); the grid renders the default `newest` sort returned by the API.
