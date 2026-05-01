# Week 2 Implementation Plan — Database Layer & Catalog API

> Source spec: `docs/sprints/week-02.md` (frozen — this plan implements it).
> Schema source-of-truth: `PLAN.md` §3 (six tables, `idx_*` indexes).
> Runner: **bun** (lock is `bun.lock`; Node 24 engine pin per `package.json`).

## 0. Context (current state)

- Wk 1 delivered: `better-sqlite3@12.9.0`, `bcryptjs@3.0.3`, `ky@2.0.2` installed; `lib/api-client.ts`; `app/api/health/route.ts` (`force-dynamic`, `Cache-Control: no-store`); security headers in `next.config.ts`.
- `.gitignore` already covers `/data/app.db*` and `!/data/seed/` (lines 43-50). Adding `!/data/seed/**` is **belt-and-braces only** — git already tracks files inside non-ignored dirs; existing rules don't ignore `seed/` contents. Harmless to add but not load-bearing (Momus #2).
- `data/` does **not** exist yet (Momus #1). Created by Phase 1's `getDb()` → `mkdirSync(...)`; `data/seed/` created by the author when writing `products.json` in Phase 2 (`mkdir -p data/seed` or via editor). `app/api/` only has `health/`.
- Health route style to match: `export const dynamic = 'force-dynamic'`, `Response.json(..., { headers: { 'Cache-Control': 'no-store' } })`, single-quote strings, no semicolons.
- Schema (PLAN.md §3): six tables + `PRAGMA foreign_keys = ON`; prices stored as `INTEGER` cents; `orders.status` defaults `'confirmed'`.
- Pre-flight reading consumed: `15-route-handlers.md`, `dynamic-routes.md` (Next 16 — `params` is a `Promise`).
- Do-not-touch list: `app/api/health/route.ts`, `next.config.ts`, `app/page.tsx`, `app/layout.tsx`, `app/providers.tsx`, `lib/api-client.ts`, `lib/utils.ts`, `components/`, `e2e/`.

## 0.1 Open-question decisions (Metis-raised)

- **Seed images**: ship one tiny gray 512×512 `missing.jpg` (~3 KB) committed to `public/seed-images/`, plus 20 byte-identical copies named `<slug>.jpg`. Generated once at commit time via a throwaway shell command (sips or an inline Node base64-decode), **not** at seed runtime. Result: every product row finds its file, seed never warns, user can replace real assets later by overwriting any file.
- **`ProductListQuery` type**: deferred to Wk3 (no hook needs it this week). Wk2 `lib/types.ts` ships only `Product` + `ApiError` per spec §6.
- **Platform**: macOS/Linux only; `rm -f` in `db:reset` is safe (project is Darwin per `.nvmrc` + bun lock).

## 1. Goal & Exit Criteria

**Goal:** `data/app.db` exists with all six tables, five indexes, 20 seeded products, and one demo user. `GET /api/products` and `GET /api/products/[slug]` return correct JSON for valid + edge-case queries. All SQL routed through `lib/db/queries.ts`.

**Exit criteria** (verbatim from spec §"Exit criteria"):
1. Six tables + five indexes present in `data/app.db`.
2. Seed idempotent — re-run produces no duplicates, no errors.
3. Demo user `demo@example.com` has `bcryptjs` hash that verifies `Demo1234!`.
4. `/api/products` and `/api/products/[slug]` return correct JSON for valid + edge-case queries.
5. **All SQL flows through `lib/db/queries.ts`** (no inline SQL in routes).

## 2. Phases (each ends with a caveman commit)

### Phase 1 — DB foundation (`feat(db): bootstrap sqlite singleton + migrations`)

Pre-step: `bun install` once, confirm `better-sqlite3` native addon resolved (`bun -e "import('better-sqlite3').then(m => console.log(typeof m.default))"` should print `function`).

Files:
- `lib/types.ts` — `Product`, `ApiError` per spec §6. **Do not** add `ProductListQuery` (Wk3).
- `lib/db/index.ts` — lazy singleton per spec §1. Notes:
  - `DB_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data/app.db')`.
  - `mkdirSync(path.dirname(DB_PATH), { recursive: true })` **inside `getDb()` before `new Database(...)`** — not at module top-level (Architect 2.1). Avoids surprise side effect on every importer.
  - Pragmas inside `getDb()`: `foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout = 5000` (Architect 2.4 — cheap insurance vs `SQLITE_BUSY` from concurrent dev shells).
  - **HMR-safe singleton via globalThis** (Architect 2.2):
    ```ts
    declare global { var __app_db: Database.Database | undefined }
    export function getDb() {
      if (globalThis.__app_db) return globalThis.__app_db
      mkdirSync(path.dirname(DB_PATH), { recursive: true })
      const db = new Database(DB_PATH)
      db.pragma('foreign_keys = ON')
      db.pragma('journal_mode = WAL')
      db.pragma('busy_timeout = 5000')
      globalThis.__app_db = db
      return db
    }
    ```
  - **`getDb()` callers in route handlers / server components must NEVER call `close()`** (Architect 2.3). Only CLI scripts close.
- `lib/db/migrate.ts` — exports `runMigrations()` (pure: takes/returns nothing, calls `getDb()`, runs `db.exec(sql)`). At the bottom, CLI guard: `if (import.meta.main) { runMigrations(); console.log('migrations done'); getDb().close() }` (Architect 1.1). SQL block: idempotent `CREATE TABLE IF NOT EXISTS` for all six tables (copy SQL from PLAN.md §3) plus the five `CREATE INDEX IF NOT EXISTS` statements — single `db.exec(sql)` call.
- `package.json` — add three scripts verbatim:
  ```json
  "db:migrate": "bun run lib/db/migrate.ts",
  "db:seed":    "bun run lib/db/seed.ts",
  "db:reset":   "rm -f data/app.db data/app.db-* && bun run db:migrate && bun run db:seed"
  ```
- `.gitignore` — append `!/data/seed/**` so `products.json` is actually tracked.

Verify:
- `bun run db:migrate` exits 0; `data/app.db` appears.
- `sqlite3 data/app.db ".schema"` lists all six tables + five indexes.
- Type-check clean: `bun run type:check`.

Commit: phase-1 caveman commit.

### Phase 2 — Seed data (`feat(db): seed 20 products + demo user`)

Files:
- `data/seed/products.json` — 20 entries across 5 categories (apparel, accessories, home, books, electronics) — 4 each. Each row: `slug`, `name`, `description`, `price_cents` (varied), `image_url: /seed-images/<slug>.jpg`, `category`, `stock` (10-50).
  - **At least one product slug+name must contain "shirt"** (so the QA `q=shirt` LIKE check is non-vacuous — Metis #17). Suggested: `apparel-classic-tee-shirt` or `apparel-linen-shirt`.
  - At least one slug must include `-` for the "real-slug" 200 QA curl.
- `public/seed-images/` — generation strategy:
  - Create one 512×512 solid-gray JPG `missing.jpg` (~3 KB) using macOS `sips` or `ffmpeg` locally (one-shot at commit time, not in seed script). Example: `sips -s format jpeg -z 512 512 <any-input>.png --out missing.jpg` or `ffmpeg -f lavfi -i color=c=gray:s=512x512:d=1 -frames:v 1 missing.jpg`.
  - For each of the 20 slugs in `products.json`, `cp missing.jpg <slug>.jpg`. All 21 files committed.
  - Result: every product row finds its file → seed never warns. User can later overwrite any file with a real CC0 image without touching code.
  - **No network downloads in seed.ts.**
- `lib/db/seed.ts` — exports `runSeed()`; CLI guard: `if (import.meta.main) { runMigrations(); runSeed(); ...; getDb().close() }` (Architect 1.1). `runSeed()`:
  - **Prod-run guard** (Security #7 MUST-FIX): at top of `runSeed()`, `if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_SEED) throw new Error('refusing to seed in production')`.
  - Loads `products.json` (relative to `process.cwd()`).
  - **Slug regex validation** (Security #6): for each loaded row, assert `/^[a-z0-9-]+$/.test(slug)` else `throw new Error('invalid slug: ' + slug)`. Prevents path traversal via `existsSync` and the served URL.
  - Per row: `INSERT INTO products (slug, name, description, price_cents, image_url, category, stock) VALUES (?,?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name, description=excluded.description, price_cents=excluded.price_cents, image_url=excluded.image_url, category=excluded.category, stock=excluded.stock` (Architect 6.1 MUST-FIX — `OR REPLACE` would renumber ids; upsert preserves them so future Wk5+ FKs don't silently break).
  - For demo user: `INSERT OR IGNORE INTO users (email, password_hash, name) VALUES (?, ?, 'Demo User')` with `bcryptjs.hashSync('Demo1234!', 10)`. Hash-on-every-run is fine (IGNORE makes it a no-op when row exists).
  - For each row, `existsSync(path.join(process.cwd(), 'public', 'seed-images', `${slug}.jpg`))` (slug already regex-validated above); if missing → `console.warn('missing image: ' + slug)` and rewrite that row's `image_url` to `/seed-images/missing.jpg` before insert. Inline; no helper extraction (Metis #11).
  - Wrap inserts in `db.transaction(() => { ... })()` for speed + atomicity.
  - End: `console.log('seed done: products=20, users=1')`. CLI block calls `getDb().close()`.

Verify:
- `bun run db:seed` exits 0; **no warnings** (because we shipped 20 named copies).
- `sqlite3 data/app.db "SELECT count(*) FROM products"` → `20`.
- `sqlite3 data/app.db "SELECT email FROM users"` → `demo@example.com`.
- Re-run: still 20 rows, 1 user, no errors.
- `git status` shows `data/seed/products.json` as tracked (negation pattern works).

Commit: phase-2 caveman commit.

### Phase 3 — Queries (`feat(db): central query helpers w/ sort allowlist`)

File: `lib/db/queries.ts`.
- `SORT_COLUMNS` constant + `SortKey` type per spec §5.
- `listProducts({ category?, sort?, q?, limit, offset })`:
  - Build SQL with **fixed clauses + bound params**. Pseudo-SQL:
    ```
    SELECT * FROM products
    WHERE 1=1
      [AND category = ?]
      [AND name LIKE ? ESCAPE '\']
    ORDER BY <SORT_COLUMNS[sort] ?? SORT_COLUMNS.newest>
    LIMIT ? OFFSET ?
    ```
  - Sort key resolution: `const orderBy = SORT_COLUMNS[sort as SortKey] ?? SORT_COLUMNS.newest`. **Never interpolate `sort` directly.**
  - LIKE pattern: escape order is **strictly `\` first, then `%`, then `_`** (Architect 6.4 — reversing causes double-escape):
    ```ts
    const pattern = '%' + q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_') + '%'
    ```
    The literal SQL string **must** include `ESCAPE '\'` directly — not a bound param (Metis #6).
  - **Prepare-on-call inside `listProducts`** (variant SQL). Do **not** build a per-variant cache map (Metis #5, Architect 7.2). `getProductBySlug` and `listCategories` use top-level `db.prepare()` consts since their SQL is fixed.
  - Returns `Product[]`. Use `stmt.all(...) as Product[]` cast — no runtime validation (Metis #10). When Wk7 introduces JOINed views (`CartItemView`), each gets its own type + cast site (Architect 6.3) — no zod.
  - **Future transactions** (Architect 3.3): when checkout lands in Wk7/8, `queries.ts` will export `db.transaction(fn)`-wrapped composites (e.g. `placeOrder(userId, shipping)`). Document the pattern here in a top-of-file comment so the file structure doesn't reorganise then. **Do not** introduce a generic `runInTransaction(fn)` helper now — wait for the actual use case.
- `getProductBySlug(slug: string): Product | null` — `SELECT * FROM products WHERE slug = ? LIMIT 1`; `.get()` returns row or `undefined` → coerce to `null` via `?? null`.
- `listCategories(): string[]` — `SELECT DISTINCT category FROM products ORDER BY category`. Authored this week per spec §5 but **no route consumes it** — that route is deferred to Wk4 (Metis #9, #12).

Verify:
- Type-check clean.
- Quick smoke via `bun run -e "..."` or via routes in Phase 4.

Commit: phase-3 caveman commit.

### Phase 4 — API routes (`feat(api): products list + slug detail routes`)

Files:
- `app/api/products/route.ts`:
  - `export const dynamic = 'force-dynamic'`.
  - Top of file constants (Architect 7.5 — no magic numbers):
    ```ts
    const DEFAULT_LIMIT = 24
    const MAX_LIMIT = 50
    ```
  - Parse `request.nextUrl.searchParams`: `category`, `sort`, `q`, `limit`, `offset`.
  - **Number coercion** (Security #4 SHOULD-FIX): use `Math.floor` + `Number.isFinite` guard:
    ```ts
    const parseInt = (raw: string | null, fallback: number) => {
      const n = Number(raw)
      return Number.isFinite(n) ? Math.floor(n) : fallback
    }
    const limit = Math.min(Math.max(parseInt(sp.get('limit'), DEFAULT_LIMIT), 1), MAX_LIMIT)
    const offset = Math.max(parseInt(sp.get('offset'), 0), 0)
    ```
  - Treat empty strings as undefined (`category || undefined`, `q || undefined`).
  - `const rows = listProducts({ category, sort, q, limit, offset })`.
  - `return Response.json(rows, { headers: { 'Cache-Control': 'no-store' } })`.
- `app/api/products/[slug]/route.ts`:
  - `export const dynamic = 'force-dynamic'`.
  - Signature: **plain `{ params }: { params: Promise<{ slug: string }> }`** (Architect 7.4 — matches existing `health/route.ts` style and the documented Next 16 pattern in `dynamic-routes.md`). Do not use `RouteContext<...>` generic.
  - `const { slug } = await params`.
  - `const product = getProductBySlug(slug)`; if null → `Response.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })`.
  - Else `Response.json(product, { headers: { 'Cache-Control': 'no-store' } })`.

Verify:
- `bun run dev` then run the manual QA checklist (Phase 5).
- Type-check + `bun run lint` clean.
- **No-inline-SQL grep** (Metis #18 + Architect 3.1/3.2 — widened): all of:
  - `grep -RE "better-sqlite3|new Database|\\.prepare\\(|\\.exec\\(" app/` → zero matches.
  - `grep -RE "from ['\"](\\.\\./)*lib/db(['\"]|/index|/migrate|/seed)" app/` → zero matches (only imports from `lib/db/queries` allowed in `app/`).
- **No stray categories route**: `test ! -d app/api/products/categories` (Metis #12).
- **`listCategories` smoke** (Architect 6.2): `bun -e "import('./lib/db/queries.ts').then(m => console.log(m.listCategories()))"` → array of 5 category strings. Captures the helper before its consumer arrives in Wk4.
- **LIKE-escape probe** (Security #3 NICE-TO-HAVE, promoted): `curl -s 'http://localhost:3000/api/products?q=50%25_off' | jq length` → returns rows or empty array, no 500. Locks the escape order against future "cleanups".

Commit: phase-4 caveman commit.

### Phase 5 — Manual QA (verify, no commit unless fixes needed)

Run every checkbox in spec §"Manual QA checklist" (lines 100-110), record output. Re-run in this exact order:
1. `rm -f data/app.db data/app.db-* && bun run db:migrate && bun run db:seed` (`db:reset` script).
2. WAL files appear (`-shm`, `-wal`); db ≈ 60-100 KB.
3. `.schema` lists 6 tables + 5 indexes.
4. `SELECT count(*) FROM products` → 20; `SELECT email FROM users` → `demo@example.com`.
5. `bun run dev`; in another shell run all 7 `curl` lines and confirm expected output.
6. SQL-injection probe (`?sort=robert%27);DROP%20TABLE--`) returns rows (allowlist works).
7. 999-limit returns 20 rows (cap).
8. Run `bun run db:seed` twice — no duplicates, no errors.
9. Verify bcrypt: in repl, `bcrypt.compareSync('Demo1234!', hashFromDb)` → `true`.

Any failure → fix in a follow-up commit before declaring done.

## 3. Out-of-scope guards (do not drift)

Spec §"Out-of-scope" is binding:
- No homepage UI, no filters UI, no cart/order endpoints, no auth, no session, no `/api/products/categories` route (deferred to later weeks per PLAN.md §4 — week-02.md does not list it).
- Do **not** touch existing health route, `next.config.ts`, `app/page.tsx`, or `lib/api-client.ts`.

## 4. Risks / open questions

- **Seed images.** Plan ships one tiny gray `missing.jpg` + 20 byte-identical copies, all CC0-trivial; replaceable per-file later.
- **Upsert preserves product ids** (resolved). `ON CONFLICT(slug) DO UPDATE` is the chosen pattern from Wk2 onward, so Wk5+ FKs (`cart_items.product_id`, `order_items.product_id`) won't silently break on re-seed.
- **Migration runner.** `bun run lib/db/migrate.ts` requires bun. Project-standard via `bun.lock`. macOS/Linux only (`rm -f` in `db:reset`).
- **`force-dynamic` in Next 16.** Confirmed harmless even though redundant with `searchParams` access. Documented per `15-route-handlers.md` §Caching.
- **TanStack `staleTime` vs `Cache-Control: no-store`** (Architect 4.2 note): server `no-store` disables HTTP/CDN caches; TanStack's in-memory `staleTime: 30_000` (Wk3) is a separate layer and does not "fight" no-store. Mention in Wk3 plan.
- **Future: revisit cache strategy** (Architect 4.3): post-Wk5, `/api/products` could move to `revalidate = 60` for public catalog reads. Not Wk2 work.
- **Future: `offset` upper bound** (Security #5): no MAX_OFFSET today. With 20 rows it's fine. Add a cap (e.g. 10_000) when catalog grows.
- **Future: route-boundary DTO convention** (Security #9): currently `Response.json(rows)` returns raw `SELECT *` including `id`/`created_at`. Acceptable for products. Once `users`/`orders` rows reach a response (Wk6/8), introduce explicit DTOs at the route boundary.
- **Future: `Vary: Cookie`** (Security #11): once auth-gated routes ship in Wk6, add to prevent cache bleed across users.
- **Future: IDOR on `[id]` routes** (Security #16): Wk7/8 cart/order routes must check ownership (`WHERE user_id = ?`), not just `await params`. Plan-of-record only.

## 5. Rollback

Single revert per phase commit. `bun run db:reset` regenerates state. Nothing in this sprint touches shared infra outside the working tree.

## Review Trail

### Metis Plan Consultant
- [x] #1 bun install pre-step + native-addon smoke check → added to Phase 1
- [x] #2 image strategy resolved (one missing.jpg + 20 byte-identical copies, generated at commit time)
- [x] #3 `!/data/seed/**` to .gitignore → added to Phase 1
- [x] #4 OR REPLACE keyed by slug, no DELETE guard → restated in Phase 2
- [x] #5 listProducts prepare-on-call; fixed-SQL helpers cached → restated in Phase 3
- [x] #6 LIKE `ESCAPE '\'` literal in SQL string → restated in Phase 3
- [x] #7 db:reset script body inlined verbatim → Phase 1
- [x] #8 no generic-typed prepare; cast as Product[] → Phase 3
- [x] #9 listCategories() exists, no route created → Phase 3 + Phase 4 verify
- [x] #10 no runtime row validation → Phase 3
- [x] #11 inline existsSync, no helper → Phase 2
- [x] #12 no categories route file (verified by grep in Phase 4) → Phase 4
- [x] #13 lib/utils.ts added to do-not-touch list → §0
- [x] #14 phase grain accepted as-is
- [x] #15 missing.jpg fallback strategy applies → Phase 2
- [x] #16 no Phase 5 commit unless fix needed → Phase 5 unchanged
- [x] #17 at least one product slug+name contains "shirt" → Phase 2
- [x] #18 no-inline-SQL grep added → Phase 4 verify
- [x] #19 image strategy resolved
- [x] #20 ProductListQuery deferred to Wk3 → §0.1 + Phase 1
- [x] #21 macOS-only `rm -f` acknowledged → §0.1

### Architect Reviewer
- [x] 1.1 CLI guard via `import.meta.main`; pure `runMigrations`/`runSeed` exports → Phase 1, Phase 2
- [x] 2.1 MUST-FIX `mkdirSync` moved inside `getDb()` → Phase 1
- [x] 2.2 globalThis-keyed singleton for HMR safety → Phase 1
- [x] 2.3 prohibit `close()` in route handlers → Phase 1
- [x] 2.4 `busy_timeout = 5000` pragma → Phase 1
- [x] 3.1/3.2 widened import-boundary grep (entire `app/`, only `lib/db/queries`) → Phase 4 verify
- [x] 3.3 transaction pattern documented at top of queries.ts → Phase 3
- [x] 4.2 TanStack staleTime vs no-store note → §4
- [x] 4.3 future `revalidate=60` candidate noted → §4
- [x] 5.2 Phase 2 split into 2a/2b — declined (single phase preferred for atomic seed-state)
- [x] 6.1 MUST-FIX `INSERT … ON CONFLICT(slug) DO UPDATE` (preserves ids) → Phase 2
- [x] 6.2 listCategories smoke in QA → Phase 4 verify
- [x] 6.3 future view-shape DTO note → Phase 3
- [x] 6.4 LIKE escape order pinned (`\` first) → Phase 3
- [x] 6.5/6.6 SQLITE_PATH + index notes — deferred (not Wk2 blockers)
- [x] 7.2 "do not cache prepared variants" promoted to plan body → Phase 3
- [x] 7.4 plain `Promise<{slug}>` signature, drop `RouteContext` → Phase 4
- [x] 7.5 DEFAULT_LIMIT/MAX_LIMIT constants → Phase 4

### Security Auditor
- [x] #1-3 SQL-injection vectors verified OK (sort allowlist, bound params, LIKE escape order)
- [x] #4 SHOULD-FIX `Math.floor` + `Number.isFinite` on limit/offset → Phase 4
- [x] #5 offset cap deferred to future (noted in §4)
- [x] #6 SHOULD-FIX slug regex `/^[a-z0-9-]+$/` validation in seed.ts → Phase 2
- [x] #7 MUST-FIX prod-run guard `NODE_ENV === 'production' && !ALLOW_PROD_SEED` → Phase 2
- [x] #8 SQLITE_PATH env trust model OK
- [x] #9 DTO convention deferred to Wk6/8 (noted in §4)
- [x] #10 404 response OK
- [x] #11 `Vary: Cookie` deferred to Wk6 (noted in §4)
- [x] #12 `Cache-Control: no-store` OK
- [x] #13 file perms OK for dev
- [x] #14 upsert resolves id-renumbering risk (now Architect 6.1 fixed) → Phase 2
- [x] #15-22 future regressions noted in §4 / not Wk2 work

### Momus Plan Reviewer
- [x] #1 NIT — `data/` does not exist; clarified in §0
- [x] #2 NIT — `!/data/seed/**` is belt-and-braces, not load-bearing; clarified in §0
- [x] #3 NIT — phase commit subjects already in headings, copy-pasteable into `/caveman-commit`
- [x] #4 NIT — LIKE-escape probe expected behavior verified
- [x] #5 NIT — `ProductListQuery` deferral acknowledged
- [x] Coverage: all 9 in-scope tasks + all 11 QA items mapped to phases
- [x] Internal contradictions: none
- [x] Out-of-scope drift: none
- [x] Verify-step feasibility: `sqlite3`, `bun -e`, `sips`, grep patterns all runnable
- [x] Verdict: **OKAY — ship it**
