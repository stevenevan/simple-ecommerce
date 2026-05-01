# Plan — Playwright Tests for Critical Money/Crash Paths

## Goal

Add Playwright e2e + API tests covering features whose failure causes
**money loss** (oversell, double-charge, mispricing, IDOR data leak)
or **crash** (500s, transaction abort leaving inconsistent state).

- **Backend (heavy)**: order creation, stock concurrency, cart mutations, auth boundary, IDOR.
- **Frontend (minimum)**: 1 e2e happy path (signup → browse → cart → checkout → orders).

## Scope (explicit non-goals)

- No unit tests, no Vitest, no component tests.
- No Stripe / payment provider — repo has no payment integration.
- No visual regression, no accessibility scans.
- No performance/load tests.
- No tests for `/api/health`, product list/category UI filtering, decorative hooks, or skeletons.

## Critical surfaces (in scope)

Money:

1. `POST /api/orders` — `lib/db/queries.ts:231-301` (`createOrderForUser` transaction).
   Money risks: oversell via stock race, total overflow, missing stock decrement, cart
   not cleared after success, money-charged-but-no-order on partial failure.
2. `POST /api/cart/items` — `app/api/cart/items/route.ts`. Risks: bypass stock cap,
   negative/non-integer qty, unlimited add via repeated calls.
3. `PATCH /api/cart/items/[id]` — `app/api/cart/items/[id]/route.ts`. Risks: edit
   another user's cart line (IDOR), set qty over stock.
4. `DELETE /api/cart/items/[id]` — same file. Risk: delete another user's line.
5. `GET /api/orders` & `GET /api/orders/[id]` — `app/api/orders/[id]/route.ts`. Risk: IDOR.

Crash / boundary:

6. `POST /api/auth/login` & `POST /api/auth/register` — credential, body-size,
   payload-shape. Risks: 500 on malformed JSON, timing oracle, session not set.
7. Body-size guard (`MAX_BODY_BYTES = 10_000`) on every mutating route.
8. Session cookie absence → 401 on every authenticated route.

## Test layout

```
tests/
  e2e/
    happy-path.spec.ts            # one frontend flow
  api/
    auth.spec.ts                  # login + register
    cart.spec.ts                  # add / patch / delete + IDOR + stock
    orders.spec.ts                # create + list + get + IDOR + overflow
    orders.race.spec.ts           # stock concurrency
    boundaries.spec.ts            # 401, 413, tampered-cookie, CSRF, no-store
    search.spec.ts                # SQLi probes on q + category
  fixtures/
    db.ts                         # reset + seed test DB
    user.ts                       # registered-user request context
playwright.config.ts
```

## Setup tasks

1. **Add deps** (ask before installing per memory rule):
   - `@playwright/test` (devDep).
2. **Scripts** in `package.json`:
   - `"test:e2e": "SQLITE_PATH=data/test.db SESSION_SECRET=test-secret-32-chars-min-do-not-use-prod playwright test"`
   - `"test:e2e:install": "playwright install chromium"`
   - **Pinned** `SESSION_SECRET` (per Metis): regenerating per invocation breaks
     partial re-runs against a live `webServer` because cookies were signed with
     the previous secret. Test-only value, never used in prod.
3. **`playwright.config.ts`**:
   - `webServer`: `bun run dev` with `SQLITE_PATH=data/test.db`,
     `SESSION_SECRET` pinned, `reuseExistingServer: false` (both local and CI per
     Metis — pinned secret + non-reuse avoids partial-rerun foot-guns).
   - `baseURL: http://localhost:3000`.
   - `projects`:
     - `chromium`: `testMatch: 'tests/e2e/**/*.spec.ts'`, default `use`.
     - `api`: `testMatch: 'tests/api/**/*.spec.ts'`, **no `use` block** (no browser
       launched) per Architect.
   - **`fullyParallel: false`, `workers: 1`** globally (Architect): single shared
     SQLite file makes parallel workers strictly destructive across files. Tests
     are I/O-bound; serial runtime stays under 90s.
   - `retries: 0` locally, `1` in CI. `forbidOnly: !!process.env.CI`.
   - `globalSetup` hook does post-boot warmup (Architect): `request.fetch` once
     against `/api/products`, `/api/auth/me`, `/api/cart` to amortize Turbopack
     compile out of the race spec window.
4. **`.gitignore`**: add `data/test.db*`, `playwright-report/`, `test-results/`,
   `.playwright/`.
5. **DB fixture** (`tests/fixtures/db.ts`):
   - `globalSetup` (Playwright config option):
     - **Guard** (Architect): `if (!process.env.SQLITE_PATH?.endsWith('test.db'))
       throw new Error('refusing to run tests without SQLITE_PATH=*/test.db')`.
     - Delete `data/test.db`, `data/test.db-shm`, `data/test.db-wal`. Then call
       `runMigrations()` **synchronously** (it returns `void`; no `await`).
     - Seed deterministic products.
     - Run `PRAGMA wal_checkpoint(TRUNCATE)` once via raw `getDb()` (Architect —
       prevents `-wal` growth across the suite).
     - `await kdb.destroy()` so the WAL connection releases before the dev
       server boots.
     - Do **not** call `bun run db:reset` — targets `data/app.db`, would clobber dev DB.
   - `resetDb()` (per-file `beforeEach`):
     - **Single transaction** (Architect): `kdb.transaction().execute(async trx =>
       { … })`. Inside: delete `order_items`, `orders`, `cart_items`, `carts`,
       `users` in FK order; `UPDATE products SET stock = ?` for each fixed id.
     - Atomicity prevents server-mid-read seeing half-truncated state.
     - Do not delete the file — running webServer holds a `globalThis.__app_db` handle.
   - Seed: product `id:1, slug:'p1', stock:5, price_cents:1000`;
     `id:2, slug:'p2', stock:1, price_cents:500`; `id:3, slug:'p3', stock:0,
     price_cents:200`; `id:4, slug:'p4', stock:2,
     price_cents: Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1`. The id:4
     row exists for the `total_overflow` test — single line × qty 2 multiplies
     past `MAX_SAFE_INTEGER`, tripping `Number.isSafeInteger(totalCents)` at
     `lib/db/queries.ts:270`. (`UNIQUE(cart_id, product_id)` at
     `lib/db/migrate.ts:35` rules out a two-row variant — Momus.)
6. **User fixture** (`tests/fixtures/user.ts`):
   - `registerUser(request, suffix?)` — POSTs `/api/auth/register`, returns `{ context, email, userId }`.
     Use `request.newContext({ baseURL })` to keep cookies isolated per user.

## Backend tests (heavy)

### `tests/api/auth.spec.ts`

- POST `/api/auth/register` happy path → 200, body has `user.id`, `Set-Cookie sec_session`.
- **Set-Cookie attributes** (Security): parse `Set-Cookie`; assert `HttpOnly`,
  `SameSite=Lax`, `Path=/`, `Max-Age=604800`, no `Domain=` attribute, and `Secure`
  only when `NODE_ENV=production` (skip the Secure assertion under test env).
  Same parse on login response.
- Reject: invalid email shape → 400 `invalid_form` w/ `fields.email`.
- Reject: short password (<8) → 400 `invalid_form`.
- Reject: password missing letter or digit → 400 `invalid_form` (registerSchema).
- Reject: name >80 chars → 400 `invalid_form`.
- Duplicate email → 401 `invalid_credentials` (per route — collapses to 401).
- POST `/api/auth/login` happy path → 200 + cookie.
- Wrong password → 401 `invalid_credentials`.
- Unknown email → 401 `invalid_credentials`.
- **Bcrypt-runs-on-miss invariant** (Security + Architect compromise): both
  unknown-email and wrong-password paths take ≥ 100ms (bcrypt cost-10 floor) and
  < 5s. Asserts the dummy-hash equalization is actually executing — not a 50%-
  delta flake test. Same shape for register: existing-email path ≥ 100ms.
- Body > 10000 bytes → 413 `payload_too_large` (no DB write — verify no row created).
- Malformed JSON body → 400 `invalid_form` (route uses `.catch(() => null)`).
- Missing `Content-Type` / empty body → 400.
- POST `/api/auth/logout` clears cookie.
- `GET /api/auth/me` is **public-shape, not auth-gated** (per
  `app/api/auth/me/route.ts:7-10`): returns 200 + `{user: null}` for unauth and
  200 + `{user: {...}}` when logged in. Test both. Do **not** assert 401 here.
- **Session destroyed server-side** (Security): logout, then **replay the old
  cookie value** in a manual request to `GET /api/cart` → 401. Proves
  destruction, not just client-side clear. (Use `/api/cart` here, not
  `/api/auth/me`, since me-route is intentionally public.)

### `tests/api/cart.spec.ts`

- POST `/api/cart/items` unauthenticated → 401.
- Add product `id:1` qty 2 → 200; GET `/api/cart` shows line, `subtotalCents = price * qty`.
- Add same product again qty 2 → upsert merges to qty 4 (verify via GET).
- **Boundary pass**: existing qty 4 + new qty 1 = stock 5 → 200 (qty exactly at stock). [Metis]
- Add product `id:1` qty that pushes total over stock (existing 4 + new 2 > stock 5) → 409 `insufficient_stock`.
- Add `id:3` (stock 0) any qty → 409.
- Add unknown productId → 404.
- Add `quantity: 0` / `-1` / `1.5` / `'2'` (string) → 400 `invalid_form`.
- Add `quantity: 1000` (> MAX_QUANTITY 999) → 400.
- PATCH `/api/cart/items/[id]` qty over stock (e.g. qty 6 vs stock 5) → 409.
- PATCH qty 0 → 400 (route requires qty ≥ 1).
- PATCH qty 1000 (> `MAX_QUANTITY` 999, `app/api/cart/items/[id]/route.ts:15`)
  → 400 `invalid_form`. Schema check fires before stock check (Momus).
- PATCH item belonging to **another user** → 404 (IDOR critical).
  - Setup: userA registers + adds line, userB registers + tries PATCH userA's line id.
- PATCH non-existent itemId → 404.
- DELETE another user's line → 404 (IDOR).
- DELETE own line → 200, GET `/api/cart` no longer contains it.
- Cart isolation: userA's GET `/api/cart` does not return userB's items.

### `tests/api/orders.spec.ts`

- POST `/api/orders` with empty cart → 400 `cart_empty`.
- Happy: add 2 of `id:1` (price 1000) → POST `/api/orders` valid shipping →
  200 `{id}`; GET `/api/orders` returns one row with `total_cents = 2000`,
  `item_count = 2`; GET `/api/orders/[id]` returns snapshot
  `name_snapshot`, `price_cents_snapshot` matching product at order time.
- Stock decremented: GET `/api/products/[slug]` shows stock dropped by ordered qty.
- Cart cleared after success: GET `/api/cart` `items: []`.
- Insufficient stock: cart has qty=5 of `id:2` (stock 1) … but route blocks add at
  cart layer, so simulate by directly inserting via DB fixture (bypass cart guard):
  insert cart_items qty 2 for product with stock 1 → POST `/api/orders` → 409
  `insufficient_stock`; verify (a) stock unchanged, (b) cart still has items, (c)
  no row in `orders` (transaction rollback).
- Shipping schema: missing field / zip non-numeric / zip "abc" / name 121 chars →
  400 `invalid_form` w/ correct `fields.*` keys.
- IDOR: userA creates order; userB GET `/api/orders/[orderA.id]` → 404.
- Ownership in list: userA's GET `/api/orders` returns only their own orders.
- Bad id format: GET `/api/orders/abc` → 404; `/api/orders/0` → 404; `/api/orders/-1` → 404.
- Unauth on POST/GET → 401.
- **Total overflow** (Metis + Momus): seed `id:4` price
  `Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1`, stock 2.
  Insert one cart_items row directly via DB fixture (qty 2). On the single
  iteration `price * 2 > MAX_SAFE_INTEGER` → `Number.isSafeInteger` check at
  `queries.ts:270` throws `total_overflow`.
  POST `/api/orders` → expect 500 `server_error` (current
  behavior — `total_overflow` not surfaced as named error in
  `app/api/orders/route.ts:39-48`). Test documents the gap; will fail loudly
  if route is later hardened to return 409, prompting an update.

### `tests/api/orders.race.spec.ts` (concurrency — the big-money one)

- Setup: product `id:2` stock 1.
- Two users each add qty 1 (passes per-user cart guard since each cart has its own
  view of stock).
- Use `Promise.allSettled` of two `POST /api/orders` against the same dev server.
  Assert **both settled `fulfilled`** (Architect — guards against a hung request
  silently passing the "exactly one 200" check).
- Expectation: **exactly one 200, one 409 `insufficient_stock`**. Assert final
  `products.stock = 0` and exactly one `orders` row inserted.
- Repeat 5 iterations (loop) with stock reseeded each time — flake guard.
- **Add inline comment in spec** (Metis): "Stock serialization relies on the
  `WHERE stock >= quantity` guard in `lib/db/queries.ts:265`. If that guard is
  removed, this test stops catching the race."

### `tests/api/search.spec.ts` (SQLi probes — Security)

Regression-protect the LIKE-escape in `lib/db/queries.ts:39-44`. Kysely already
parameterizes; this guards the manual `%`/`_`/`\` escape from accidental removal.

- Seed: ensure no product names contain `%`, `_`, `\`, `'`, `"`, `;` literals.
- For each payload in `['%', '_', '\\', "'", '"', ';', "' OR 1=1--", '100%']`:
  - `GET /api/products?q=<payload>` → 200, response is an array (may be empty).
    Assert no 500 and no SQL error leaks in body.
- Same payload set against `?category=<payload>` → 200, empty array (category
  is exact-match in `queries.ts:36`).
- A `q` of `100%` literal MUST return zero results when no product name contains
  the literal substring `100%` — proves `%` is escaped, not a wildcard.

### `tests/api/boundaries.spec.ts`

- All mutating routes reject `Content-Length > 10000` → 413 (`POST /api/orders`,
  `POST /api/cart/items`, `PATCH /api/cart/items/[id]`, `POST /api/auth/login`,
  `POST /api/auth/register`). **Sole location** for body-size assertions
  (Architect — duplicates removed from per-route specs).
- Unauth (`401`) on `GET /api/cart`, `POST /api/cart/items`,
  `PATCH /api/cart/items/[id]`, `DELETE /api/cart/items/[id]`, `GET /api/orders`,
  `POST /api/orders`, `GET /api/orders/[id]`. (Excluding `/api/auth/me` —
  intentionally returns 200 + `{user: null}`.)
- **Tampered cookie** (Security): set `sec_session=garbage`,
  `sec_session=` (empty), `sec_session=<random base64 not signed by SESSION_SECRET>`
  on `GET /api/cart` → 401 each, never 500. (Same probe against `/api/auth/me`
  → 200 `{user: null}` — proves the catch-and-fallback at me-route line 8.)
- `Cache-Control: no-store` on routes that explicitly set `NO_STORE`: `GET /api/cart`,
  `GET /api/orders`, `GET /api/orders/[id]`, `GET /api/auth/me` (Metis).
- **No-store on 401 response** (Security, retargeted): assert
  `Cache-Control: no-store` on the 401 from unauth `GET /api/cart` (which
  flows through `ensureSession` at `lib/auth.ts:12`). Prevents shared-cache
  leak. (Original target `/api/auth/me` does not 401; retargeted per Momus.)
- **CSRF non-vector** (Security): cross-origin `POST /api/cart/items` with
  `Content-Type: text/plain` body and `Origin: https://evil.example` → 400
  (route's JSON parse fails / schema rejects). Assert never 200. Documents that
  `Content-Type: application/json` + JSON body shape is the de-facto CSRF guard
  alongside `sameSite=lax`.

## Frontend tests (minimum)

### `tests/e2e/happy-path.spec.ts`

One signup-to-order flow on Chromium:

1. Visit `/`, see product grid.
2. Click product → `/products/[slug]`.
3. Click "Add to cart" → must redirect / prompt login.
4. Go to `/register`, submit valid form → lands logged in.
5. Add to cart → `/checkout`.
6. Fill shipping → submit → `/orders/[id]` shown.
7. `/orders` lists the new order with correct total.

That is the **only** UI-driven test. Everything else hits API layer for speed
and determinism.

## Verification

- `bun run test:e2e` exits 0 locally with `data/test.db` ephemeral.
- Race spec: 5/5 iterations pass; both promises `fulfilled`.
- Total runtime target < 120 seconds (revised from 90s — Architect: dev server
  cold-compile + serial workers).
- `workers: 1`, `fullyParallel: false` — fully serial, both projects.

## Risks / open questions

- **Test DB lifecycle**: webServer holds a `globalThis.__app_db` handle to
  `data/test.db`. Reset truncates inside a single Kysely transaction (atomic from
  server's read POV). `globalSetup` does file-delete + migrate before the server
  boots; per-test reset is truncate-only.
- **Concurrency under SQLite WAL**: `busy_timeout = 5000` plus the
  `WHERE stock >= quantity` UPDATE guard at `lib/db/queries.ts:265` is the
  serializer. Race spec includes inline comment naming this dependency.
- **Bcrypt timing test**: floor (≥ 100ms) + ceiling (< 5s) only — proves bcrypt
  ran on miss-path without flaky percentage-delta math.
- **No rate limiting** (Security): `/api/auth/login` has no brute-force defense
  in code today. Out of scope for this test pass — flag as known gap.
- **CSRF**: `sameSite=lax` + JSON-only body shape are sole defenses; no
  Origin/Referer check. CSRF non-vector test documents current state.
- **Node 24 + Playwright**: confirm `@playwright/test` supports Node 24 before install.
- **API spec import boundary** (Architect): `tsconfig.test.json` (extending root)
  with `"paths"` excluding `@/components/*` from `tests/api/**`, OR an oxlint rule
  forbidding `@/components` imports under `tests/api/**`. Mirrors the
  server-only invariants in `AGENTS.md`.

## Implementation order

1. Add deps (after user confirms install).
2. `playwright.config.ts` + scripts + `.gitignore`.
3. DB + user fixtures (incl. `globalSetup` SQLITE_PATH guard, warmup).
4. `auth.spec.ts` → run green.
5. `cart.spec.ts` → run green.
6. `orders.spec.ts` → run green.
7. `orders.race.spec.ts` → run green 5x.
8. `search.spec.ts` → run green.
9. `boundaries.spec.ts` → run green.
10. `happy-path.spec.ts` (frontend) → run green.
11. Add **one paragraph** to `README.md` with run commands (`bun run test:e2e:install`,
    `bun run test:e2e`). No architecture section.

## Review Trail

### Metis Plan Consultant
- [x] Pin `SESSION_SECRET` to fixed test value (not `openssl rand`) — applied to scripts.
- [x] `globalSetup` deletes `data/test.db*` directly (not via `bun run db:reset`); calls `runMigrations()` sync; `await kdb.destroy()` after seed.
- [x] `resetDb()` truncates via Kysely (not file delete) to avoid clobbering webServer's `__app_db` handle.
- [x] Added cart boundary-pass test: existing 4 + new 1 = stock 5 → 200.
- [x] Added `total_overflow` test in `orders.spec.ts` (seed `id:4` w/ `MAX_SAFE_INTEGER/3` price).
- [x] Race spec gets inline comment naming `lib/db/queries.ts:265` `WHERE stock >= quantity` as the load-bearing guard.
- [x] `Cache-Control: no-store` assertions limited to routes that actually set `NO_STORE` (4 routes).
- [x] README addition capped at one paragraph.
- [x] Confirmed: duplicate-email register → 401 (already in plan; no change).
- [x] Confirmed: race spec correctness depends on UPDATE WHERE-guard, not isolation level — documented.

### Security Auditor
- [x] Tampered-cookie test added (boundaries.spec.ts).
- [x] Register timing-equalization test added (re-scoped to bcrypt-runs invariant: ≥ 100ms, < 5s — also for login miss-path).
- [x] SQLi probes against `q` and `category` → new `tests/api/search.spec.ts`.
- [x] Set-Cookie attribute assertions added (HttpOnly, SameSite=Lax, Path, Max-Age, no Domain) on register + login.
- [x] Replayed-old-cookie test post-logout added.
- [x] `Cache-Control: no-store` on 401 from `/api/auth/me` added.
- [x] CSRF non-vector test (cross-origin, text/plain) added.
- [x] No-rate-limit gap flagged in Risks.

### Architect Reviewer
- [x] `projects` split: `chromium` for `tests/e2e/**`, `api` (no browser, no `use`) for `tests/api/**`; explicit `testMatch`.
- [x] `fullyParallel: false`, `workers: 1` globally — single SQLite file makes parallel destructive.
- [x] `resetDb()` truncation wrapped in single Kysely transaction.
- [x] `PRAGMA wal_checkpoint(TRUNCATE)` once in `globalSetup` after seed.
- [x] `SQLITE_PATH` guard in `globalSetup` (must end with `test.db`).
- [x] `globalSetup` warmup: pre-fetch `/api/products`, `/api/auth/me`, `/api/cart` to amortize Turbopack compile cost.
- [x] Race spec uses `Promise.allSettled` + asserts both `fulfilled`.
- [x] Cut: wrong-method 405 (framework behavior, not ours).
- [x] Cut: timing-oracle delta-% test — replaced w/ floor/ceiling invariant per Security need.
- [x] Body-size 413 assertions consolidated to `boundaries.spec.ts` only.
- [x] `tsconfig.test.json` / oxlint rule banning `@/components/*` from `tests/api/**` — added to Risks.
- [x] Runtime budget revised 90s → 120s.

### Momus Plan Reviewer
- [x] **Fixed**: `/api/auth/me` returns 200 + `{user: null}` for unauth (per
  `app/api/auth/me/route.ts:7-10`), not 401. Removed all 401 assertions on
  me-route; pivoted unauth/tampered-cookie/no-store-on-401 assertions onto
  `/api/cart` (which DOES flow through `ensureSession`).
- [x] **Fixed**: `total_overflow` setup re-spec'd. `UNIQUE(cart_id, product_id)`
  blocks the two-row variant; switched to single-row × qty-2 with
  `price = floor(MAX_SAFE_INTEGER/2) + 1` so multiplication itself overflows.
- [x] **Fixed**: PATCH 1000 qty trips schema (400) before stock (409). Added
  explicit assertion line.
- [x] Verified: `BCRYPT_COST = 10` in both `lib/auth.ts:4` and login dummy hash.
- [x] Verified: `MAX_QUANTITY = 999` in both POST and PATCH cart routes.
- [x] Verified: `Set-Cookie Max-Age = 604800` (`lib/session.ts:21`).
- [x] Verified: `runMigrations` is sync `void` (`lib/db/migrate.ts:66`).
- [x] Verified: stock guard at `lib/db/queries.ts:265`; LIKE escape at lines 39-44.
- [x] Verified: seeded ids 1..4 stable (rowid, no pre-inserts in migrate.ts).
- [x] Confirmed `'100%'` SQLi probe — no seeded product name contains the literal `100%`.
