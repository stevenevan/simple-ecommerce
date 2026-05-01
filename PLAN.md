# Simple E-Commerce — 8-Sprint Plan

## 1. Context

Demo e-commerce on Next.js 16.2 + React 19. Local SQLite as DB, TanStack Query + ky for client data, shadcn/ui for components. Eight one-week sprints take the repo from create-next-app shell to a working browse → auth → cart → checkout → orders flow.

End deliverable of *this* planning task: 8 markdown files in `docs/sprints/week-01.md` … `week-08.md`, each describing focus, scope, tasks, manual-QA, exit criteria, and the transition to the next sprint.

## 2. Stack & Dependencies (locked-in)

| Concern | Choice | Reason |
|---|---|---|
| Runtime | **Node 24** | user-pinned; overrides Next 16's 20.9 minimum |
| Framework | Next.js **16.2.4** (App Router, Turbopack default, React 19.2) | already installed, "NOT the Next.js you know" — defer to `node_modules/next/dist/docs/` |
| DB | **SQLite** via `better-sqlite3` (sync, embedded) | required by user |
| Data fetching | **TanStack Query v5** + **`ky`** | required by user |
| UI | **shadcn/ui** + Tailwind v4 (already installed) | required by user |
| Auth session | **`iron-session`** (encrypted stateless cookies) | user choice |
| Password hash | **`bcryptjs`** (pure-JS, no native build) | pairs with bcryptjs — works under Turbopack |
| Toast | **`sonner`** (shadcn-recommended) | user choice |
| Seed data | **Local JSON** (`data/seed/products.json`, ~20 SKUs) | user choice |
| Tests | **Manual QA per sprint** (no formal harness) | user choice |

### Constraints (do not violate)

- No third-party libs in checkout (form validation hand-rolled).
- iron-session is the only auth library (pairs with bcryptjs for hashing).
- DB file `data/app.db` — gitignored; created by migration script.
- Read the relevant `node_modules/next/dist/docs/01-app/**` page before writing any Next-specific code (Route Handlers, Server Components, Forms, Authentication).
- **`cacheComponents` stays OFF** for the duration of the 8 sprints. `next.config.ts` does not set the flag (default = false in 16.2.4). The legacy route-segment-config caching model (`dynamic`, `revalidate`) is the model in force. Sprint writers MUST NOT introduce `'use cache'` / `cacheLife` / `cacheTag` — they belong to the opposite model.
- **No `middleware.ts` file.** Auth-gating is enforced inside route handlers (401) and via client-side redirects from `useMe`. In Next 16 the file would be `proxy.ts`; we do not author one.
- **Pre-existing `e2e/` directory is left untouched.** No sprint writes to it. Mention as a "future hook" only in the final README.
- **Never run package-install commands without asking the user first.** Applies to `bun add` (any new dep), `npm install <pkg>`, `bunx shadcn@latest add <new component>`, etc. Sprint files list the dep set and prefix the commands with "ASK USER before running". A bare `bun install` (refresh from lockfile) is fine.

## 3. Domain & Schema (frozen for week 2)

Tables (created idempotently by `lib/db/migrate.ts`):

```sql
users        (id INTEGER PK, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
              name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)

products     (id INTEGER PK, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
              description TEXT NOT NULL, price_cents INTEGER NOT NULL,
              image_url TEXT NOT NULL, category TEXT NOT NULL, stock INTEGER NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)

carts        (id INTEGER PK, user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)

cart_items   (id INTEGER PK, cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
              product_id INTEGER NOT NULL REFERENCES products(id),
              quantity INTEGER NOT NULL CHECK (quantity > 0),
              UNIQUE(cart_id, product_id))

orders       (id INTEGER PK, user_id INTEGER NOT NULL REFERENCES users(id),
              total_cents INTEGER NOT NULL,
              shipping_name TEXT NOT NULL, shipping_address TEXT NOT NULL,
              shipping_city TEXT NOT NULL, shipping_zip TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'confirmed',  -- 'confirmed' (no payment integration in demo)
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)

order_items  (id INTEGER PK, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
              product_id INTEGER NOT NULL REFERENCES products(id),
              name_snapshot TEXT NOT NULL, price_cents_snapshot INTEGER NOT NULL,
              quantity INTEGER NOT NULL CHECK (quantity > 0))
```

`PRAGMA foreign_keys = ON;` in db init. Prices stored as integer cents — never float.

### Indexes (created by Week 2 migration)

```sql
CREATE INDEX IF NOT EXISTS idx_products_category   ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_created    ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart     ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items(order_id);
-- products.slug, users.email already covered by UNIQUE.
```

### Schema known limitations (acknowledged, not fixed)

- No `pending` order state; no inventory event log; stock decremented at checkout in the same transaction (atomic per-row, but no two-phase reservation).
- `orders.status` only has `'confirmed'` (and could move to `'shipped'` etc., but the demo never does).
- Read-then-decrement at checkout is wrapped in a single `db.transaction(...)` and uses `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?`; abort if `changes === 0` (409). This is the **only** stock-protection mechanism — see Week 8.

## 4. Folder Layout (target by week 8)

```
app/
  layout.tsx                    root + Providers + Toaster + Header
  providers.tsx                 QueryClientProvider, ToasterClient
  page.tsx                      homepage grid (client)
  products/[slug]/page.tsx      detail (server component, direct DB read)
  login/page.tsx, register/page.tsx
  checkout/page.tsx, checkout/success/[id]/page.tsx
  orders/page.tsx
  api/
    health/route.ts
    products/route.ts                     GET (filter/sort/search)
    products/[slug]/route.ts              GET
    products/categories/route.ts          GET
    auth/register/route.ts                POST
    auth/login/route.ts                   POST
    auth/logout/route.ts                  POST
    auth/me/route.ts                      GET
    cart/route.ts                         GET
    cart/items/route.ts                   POST
    cart/items/[id]/route.ts              PATCH, DELETE
    orders/route.ts                       GET, POST
    orders/[id]/route.ts                  GET
components/ui/                  shadcn primitives
components/                     ProductCard, FilterBar, CartDrawer, etc.
lib/
  db/index.ts        better-sqlite3 singleton
  db/migrate.ts      CREATE TABLE IF NOT EXISTS …
  db/seed.ts         loads data/seed/products.json + demo user
  api-client.ts      ky instance (baseUrl, credentials)
  session.ts         iron-session helpers
  auth.ts            password hash/verify, ensureSession
  hooks/             useProducts, useProduct, useCart, useMe, useMutations
  validators.ts      hand-rolled email/password/checkout form validators
  format.ts          currency, dates
  types.ts           Product, CartItem, Order, SessionUser, …
data/
  seed/products.json
  app.db (gitignored)
```

## 5. Sprint Map (one-line summaries)

| Wk | Theme | Headline outcome |
|----|---|---|
| 1 | Foundation & tooling | shadcn init, deps installed, Providers wired, `/api/health` green |
| 2 | DB layer + catalog API | migrate + seed scripts, `GET /api/products(?category&sort&q)`, `/api/products/[slug]` |
| 3 | Homepage product grid | shadcn cards + skeleton, useProducts hook, currency format |
| 4 | Filter / sort / search | FilterBar, URL-synced search params, debounced text, categories endpoint |
| 5 | Product detail page | Server-component detail (direct DB), AddToCart island, loading/error/not-found |
| 6 | Authentication | iron-session, bcryptjs, register/login/logout/me, demo account, header user menu |
| 7 | Cart | cart endpoints (auth-gated), CartDrawer (sheet), qty controls, sonner toasts |
| 8 | Checkout & orders | POST /api/orders (txn snapshots), checkout form (hand-rolled validation), success page, /orders list |

Each sprint file follows the same template:

```
# Week N — <Theme>
## Goals
## In-scope tasks (numbered, with file paths)
## Out-of-scope (explicit; punts to later weeks)
## Dependencies (from prior weeks) + Risks
## Manual QA checklist
## Exit criteria (what "done" means)
## Transition to Week N+1
```

## 6. Sprint-by-sprint details

### Week 1 — Foundation & tooling
- Verify Node 20.9+, bun present.
- **Inspect `next.config.ts`** — confirm no `cacheComponents` flag. Document in the sprint file: "Cache Components mode is OFF; we use the route-segment-config caching model (`dynamic`, `revalidate`)."
- `bunx shadcn@latest init` (Tailwind v4 detected, neutral theme).
- Install runtime deps:
  `bun add better-sqlite3 @tanstack/react-query @tanstack/react-query-devtools ky iron-session bcryptjs sonner`
  Dev: `bun add -D @types/better-sqlite3 @types/bcryptjs`.
- `app/providers.tsx`: client component, `QueryClientProvider` (default `staleTime: 30_000`), `<Toaster richColors />`.
- Replace template `app/layout.tsx` body to wrap `<Providers>{children}</Providers>`; update `<title>` / `<description>`.
- Replace template `app/page.tsx` with empty `<main className="container mx-auto p-8" />`.
- `app/api/health/route.ts`: returns `Response.json({ ok: true })`. **Do not grow this file in later sprints.**
- `lib/api-client.ts`: `ky.create({ prefixUrl: '/api', credentials: 'include', throwHttpErrors: true })`. **Pinned policy:** ky throws on 4xx/5xx. Every `mutationFn` / `queryFn` catches `HTTPError`, reads `error.response.json()`, and re-throws an `Error` whose `.message` is the server's `{error: string}` field. TanStack mutations surface this via `onError` → `toast.error(err.message)`.
- Add `data/` and `data/app.db*` to `.gitignore`.
- **QA**: `bun dev` → `/` blank, `/api/health` → `{ok:true}`, no React/Tailwind console errors.
- **Transition**: deps in place; Week 2 lays the schema and seeds rows.

### Week 2 — DB layer + catalog API
- `lib/db/index.ts`: lazy singleton (`new Database(process.env.SQLITE_PATH ?? 'data/app.db')`, `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`).
- `lib/db/migrate.ts`: `CREATE TABLE IF NOT EXISTS …` for all six tables; idempotent.
- `data/seed/products.json`: 20 products (5 categories, varied prices), images point at `/seed-images/<slug>.jpg`. Drop placeholder JPGs in `public/seed-images/`.
- `lib/db/seed.ts`: upsert products by slug, insert demo user (`demo@example.com` / `Demo1234!`) with bcryptjs hash. Idempotent.
- Add scripts to `package.json`:
  `"db:migrate": "bun run lib/db/migrate.ts"`, `"db:seed": "bun run lib/db/seed.ts"`, `"db:reset": "rm -f data/app.db && bun run db:migrate && bun run db:seed"`.
- **Commit to `lib/db/queries.ts` from this sprint** — every route handler imports query functions; no inline SQL inside route handlers. Helpers introduced here: `listProducts(filter)`, `getProductBySlug(slug)`, `listCategories()`. Cart/order helpers added in their own weeks.
- `app/api/products/route.ts`: GET — accepts `category`, `sort`, `q` (LIKE on name), pagination. **Limits: default `limit = 24`, hard cap `MAX_LIMIT = 50`** — server-side clamp; client cannot exceed. **Sort allowlist** (concrete constant in `queries.ts`):
  ```ts
  const SORT_COLUMNS = {
    price_asc:  'price_cents ASC',
    price_desc: 'price_cents DESC',
    name_asc:   'name COLLATE NOCASE ASC',
    newest:     'created_at DESC',
  } as const
  ```
  Anything not in the map → fallback to `newest`. Same pattern reused in queries.
- Route handler `params` is a **Promise** in Next 16 — `[slug]/route.ts` must `const { slug } = await params`. Same applies to every other dynamic route handler authored later.
- `app/api/products/[slug]/route.ts`: GET — 404 if missing.
- `lib/types.ts`: `Product`, `ProductListQuery`, `ApiError`.
- **QA**: `curl /api/products?category=apparel&sort=price_asc&q=shirt` returns expected subset; bogus slug → 404; demo user hash verifies.
- **Transition**: API stable; Week 3 builds the homepage grid against it.

### Week 3 — Homepage product grid
- `bunx shadcn@latest add card button badge skeleton aspect-ratio`.
- `lib/format.ts`: `formatCurrency(cents: number): string` — single hardcoded locale/currency (`en-US`, `USD`). No params, no knobs.
- `lib/hooks/useProducts.ts`: `useQuery({ queryKey: ['products', params], queryFn: () => api.get('products', { searchParams: params }).json<Product[]>() })`.
- `components/ProductCard.tsx`: `next/image` (with `width`/`height`), name, price, category badge, link to `/products/[slug]`.
- `components/ProductGridSkeleton.tsx`: 8 shadcn skeleton cards.
- `app/page.tsx` (client): renders header section + grid; pending → skeleton, error → inline message + retry button, empty → empty state.
- Header component (`components/Header.tsx`) shell with logo + cart placeholder slot.
- **QA**: throttle network to "Slow 3G" → skeletons appear; broken image fallback OK; HMR works under Turbopack.
- **Transition**: grid renders all products; Week 4 adds filtering UX on top.

### Week 4 — Filter / sort / search
- `bunx shadcn@latest add select input separator`.
- `app/api/products/categories/route.ts`: GET → distinct categories.
- `components/FilterBar.tsx` (client): category Select, sort Select, search Input. State source-of-truth = URL search params (`useSearchParams`, `useRouter`, `usePathname`).
- Debounce search 250 ms via `setTimeout` ref; on settle → `router.replace(`?${new URLSearchParams(...)}`, { scroll: false })`.
- `useProducts` keyed by serialized URLSearchParams → cache hits per filter combo.
- Update `app/page.tsx` to a layout with `<FilterBar />` above the grid.
- **QA**: change category/sort/search → URL updates; reload preserves state; back/forward restores state; empty result shows empty state.
- **Transition**: list page complete; Week 5 builds detail.

### Week 5 — Product detail page
- **Dependencies (from prior weeks):** Wk 2 (`getProductBySlug` exists). Wk 4 (filtering UX) is *not* a hard prereq — Week 5 can ship without it.
- `bunx shadcn@latest add tabs`.
- `app/products/[slug]/page.tsx`: **server component**, `params` is a Promise — `const { slug } = await params`. Direct call to existing `lib/db/queries.ts:getProductBySlug(slug)` (no new abstraction — query helper was introduced in Week 2). `notFound()` on miss.
- **Add `export const dynamic = 'force-dynamic'`** at the top of the page file — DB rows can change between dev `db:reset` runs and we want fresh reads for the demo.
- **Public route** — no `ensureSession()` call. AddToCart island handles unauth via toast + login link.
- `app/products/[slug]/loading.tsx`: detail skeleton.
- `app/products/[slug]/not-found.tsx`: 404 UI.
- `components/AddToCartButton.tsx` (client island): props `{ productId, stock }`; for now just toasts "sign in to add" (real wiring lands in Week 7 once cart endpoints exist).
- `components/ProductImage.tsx`: full-width `next/image`.
- `components/ProductSpecs.tsx`: name, price, description, stock badge.
- **QA**: deep-link to a slug works; bogus slug → 404; image renders; AddToCart shows placeholder toast.
- **Transition**: catalog complete; Week 6 introduces auth so cart can attach to a user.

### Week 6 — Authentication
- `.env.example` + local `.env`: `SESSION_SECRET=` (≥ 32 char random). `lib/session.ts` reads it at module load; throws if missing.
- `lib/session.ts` — exact iron-session signature, no shorthand:
  ```ts
  import { getIronSession, type SessionOptions } from 'iron-session'
  import { cookies } from 'next/headers'

  export type SessionUser = { id: number; email: string; name: string }
  export type SessionData = { user?: SessionUser }

  export const sessionOptions: SessionOptions = {
    cookieName: 'sec_session',
    password: process.env.SESSION_SECRET!,
    cookieOptions: { httpOnly: true, sameSite: 'lax',
                     secure: process.env.NODE_ENV === 'production',
                     maxAge: 60 * 60 * 24 * 7 },
  }

  export async function getSession() {
    return getIronSession<SessionData>(await cookies(), sessionOptions)
  }
  ```
  **`cookies()` is async in Next 16 — always `await` it.**
- `lib/auth.ts`: `hashPassword`, `verifyPassword` (bcryptjs cost 10), `ensureSession()` helper that calls `getSession()` and throws `Response.json({error:'unauthorized'},{status:401})` if no `session.user`.
- `lib/validators.ts`: `validateEmail`, `validatePassword` (min 8, ≥1 letter, ≥1 digit) — extended (not recreated) in Week 8.
- **Stub-only cart query helpers added to `lib/db/queries.ts`** (signatures with `throw new Error('Week 7')` body): `getOrCreateCart`, `listCartItems`, `upsertCartItem`, `updateCartItemQty`, `removeCartItem`. Lets Week 7 fill in bodies without restructuring the file.
- `app/api/auth/register/route.ts`: POST — validate → check email uniqueness → hash → insert user → `session.user = {...}; await session.save()` → 200.
- `app/api/auth/login/route.ts`: POST — fetch user → `verifyPassword` → save session → 200; generic "invalid credentials" on any failure (no leak about email vs password).
- `app/api/auth/logout/route.ts`: POST — `await session.destroy()` → 200.
- `app/api/auth/me/route.ts`: GET — returns `{ user: session.user ?? null }` (200, never 401).
- `app/login/page.tsx`, `app/register/page.tsx`: client forms, `useMutation` against `/api/auth/*`, hand-rolled inline validation. **Login page renders the literal demo creds inline** (small muted text under the form): `demo@example.com` / `Demo1234!` — must match the seed in Wk 2 exactly.
- `lib/hooks/useMe.ts`: `useQuery({ queryKey: ['me'], queryFn: ..., staleTime: 0 })`. **`staleTime: 0` overrides the global default** so post-mutation invalidations refetch immediately.
- **Mutation cache hygiene** (close the stale-session window):
  - Login `onSuccess` → `queryClient.setQueryData(['me'], { user })`, `invalidateQueries({ queryKey: ['cart'] })`.
  - Logout `onSuccess` → `setQueryData(['me'], { user: null })`, `removeQueries({ queryKey: ['cart'] })` (drop, don't refetch — there's no session anyway).
  - Register `onSuccess` → same as login.
- Update `Header.tsx`: shows "Login" link or shadcn `dropdown-menu` with email + Logout.
- Demo user already seeded in Week 2.
- README hand-off note for Wk 6: rotating `SESSION_SECRET` invalidates every existing cookie (users get logged out). Document it.
- **QA**: register fresh user → me returns user; logout → me returns null; demo creds work; weak password rejected; duplicate email rejected with same generic message; session survives reload; logout immediately clears CartDrawer (no flash of prior items).
- **Transition**: identity is solid; Week 7 fills in the cart query bodies.

### Week 7 — Cart
- **Dependencies (from prior weeks):** Wk 2 (schema), Wk 5 (`AddToCartButton` placeholder), Wk 6 (`ensureSession`, query stubs). Hard prereqs.
- `bunx shadcn@latest add sheet dialog`.
- **Fill in cart query bodies** in `lib/db/queries.ts` (stubs created in Week 6): `getOrCreateCart`, `listCartItems` (single `JOIN` against products returning `id, product_id, name, price_cents, image_url, stock, quantity` — **no per-item lookup loop**), `upsertCartItem`, `updateCartItemQty`, `removeCartItem`. Multi-step paths (insert-or-update; remove + recompute) wrapped in `db.transaction(...)`.
- `app/api/cart/route.ts`: GET (use `ensureSession`) — returns `{ items: CartItemView[], subtotalCents }`.
- `app/api/cart/items/route.ts`: POST `{ productId, quantity }` — server fetches product (price + stock from DB), enforces `qty <= stock` (409 if not), upserts.
- `app/api/cart/items/[id]/route.ts`: PATCH `{ quantity }`, DELETE. Both `await params` and verify item belongs to caller's cart (404 otherwise).
- `lib/hooks/useCart.ts`: `useQuery({ queryKey: ['cart'], staleTime: 0, enabled: !!me?.user })` (skip when logged out) + `useAddItem`, `useUpdateQty`, `useRemoveItem` mutations; on success → `queryClient.invalidateQueries({ queryKey: ['cart'] })` and `toast.success`. On `HTTPError` → `toast.error(message)`.
- `components/CartDrawer.tsx`: shadcn `sheet`, opens from header cart icon (badge = items count), lists items with qty +/- and remove, shows subtotal, "Checkout" button → `/checkout`.
- Real wiring of `AddToCartButton` (replaces Week 5 placeholder, **same props `{ productId, stock }`**): a local `useState` holds quantity (default 1, +/- buttons clamped to `[1, stock]`); on click → if `me === null` toast + link to login, else `useAddItem.mutate({ productId, quantity })`.
- **QA**: add 2 different products, update qty, remove, refresh persists, **on the same machine open a second browser profile / private window, log in as the same user → CartDrawer shows the same items** (proves DB-backed not local state), exceeding stock returns 409 → toast surfaces message, anonymous add → 401 → toast + link to login.
- **Transition**: cart is durable; Week 8 turns a cart into an order.

### Week 8 — Checkout & orders
- **Dependencies (from prior weeks):** Wk 6 (`ensureSession`, `validators.ts`), Wk 7 (`getOrCreateCart`, `listCartItems`, plus the cart UI feeding into `/checkout`). Hard prereqs.
- **Extend** existing `lib/validators.ts` (already created in Week 6): add `validateCheckoutForm({ name, address, city, zip })` — all required, zip pattern `/^\d{4,10}$/`.
- `app/api/orders/route.ts`:
  - POST: in a single `db.transaction(...)`:
    1. Load cart items (with current product price + stock from products table).
    2. **Decrement stock per line:** for each item run `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?`; if `result.changes === 0` → throw → transaction aborts → return `409 { error: "insufficient_stock", productId }`.
    3. Recompute `total_cents` = sum(price_cents × qty) using freshly-read prices (do not trust the client; do not use the snapshot at this point).
    4. Insert `orders` row.
    5. Insert `order_items` snapshots (`name_snapshot`, `price_cents_snapshot`).
    6. `DELETE FROM cart_items WHERE cart_id = ?`.
    7. Return `{ id }`.
  - 400 if cart empty (do this *before* opening the transaction).
  - GET: list current user's orders. Single query with `LEFT JOIN order_items` + `GROUP BY orders.id` returning `(id, total_cents, created_at, item_count)` — **no per-row lookup**.
- `app/api/orders/[id]/route.ts`: GET — order + items, 404 if not the user's. `await params`.
- `app/checkout/page.tsx`: client form (no react-hook-form), submits via `useMutation`, shows field-level errors from local validator, disables submit while pending; on success → `router.push('/checkout/success/${id}')`.
- `app/checkout/success/[id]/page.tsx`: server component, reads order via `getOrderForUser`, shows summary; 404 if not theirs.
- `app/orders/page.tsx`: client, `useQuery({ queryKey: ['orders'] })`, list rendering date + total + item count. **Each row links to `/checkout/success/[id]` — that page is the canonical order-detail view; we do not author a separate `/orders/[id]` page.**
- Header: add "Orders" link when authed.
- README hand-off block at end of week: demo creds, run commands (`bun install`, `bun run db:reset`, `bun dev`), known limitations: single currency, no payment integration, no concurrent stock-decrement protection beyond CHECK, no email verification, no `e2e/` tests in this milestone (folder exists but unused).
- **QA**: full happy path login → browse → filter → detail → add 2 items → checkout → success → /orders shows the new order; refresh both pages persists; checkout with empty cart fails gracefully (empty-cart route returns 400, UI shows toast + redirects to /); invalid zip blocks submit client-side and server returns 400 if bypassed via curl.
- **Transition**: feature-complete demo.

## 7. Cross-cutting Decisions

- **All money in cents (integer).** Format only at the edge.
- **Server is source of truth for prices.** Client never sends a price.
- **Sort columns travel through a literal allowlist map** (see Week 2) — user-supplied sort key indexes the map, never interpolated into SQL. LIKE search uses parameterised `?` binding with `%` wrappers added server-side.
- **Route handlers run on Node runtime** (default in 16). `better-sqlite3` is native; never set `runtime = 'edge'`.
- **`params` is a Promise** in Next 16 — always `await params`. Applies to **both** dynamic page components and dynamic route handlers.
- **`cookies()` is async** — always `await cookies()` before passing to `getIronSession`.
- **iron-session secret** validated at module load; missing secret throws and crashes the route handler loudly.
- **bcryptjs** chosen over `bcrypt` to avoid native build pain.
- **Caching model = legacy route-segment-config** (because `cacheComponents` is OFF). Auth / cart / orders route handlers — `export const dynamic = 'force-dynamic'`. Product list route handler reads `searchParams` so it's already dynamic; the **server-component product detail page** sets `export const dynamic = 'force-dynamic'` explicitly. DO NOT use `'use cache'`, `cacheLife`, or `cacheTag` anywhere.
- **No `middleware.ts` / `proxy.ts`** in any sprint.
- **ky throws on 4xx/5xx** by config; every mutation wraps in try/catch, parses `error.response.json()` for `{error}`, re-throws `Error(message)`. TanStack `onError` shows `toast.error`.

### Layer & module rules (one-way; non-negotiable)

- **Server components and route handlers** import from `lib/db/queries.ts`, `lib/auth.ts`, `lib/session.ts`. They do **NOT** import `lib/api-client.ts`.
- **Client components and hooks** import from `lib/api-client.ts`. They do **NOT** import `lib/db/*`.
- **Server components never call their own `/api/*`** — go straight to `queries.ts`. Route handlers and server components share `queries.ts`.
- **Module direction:** `lib/db/queries.ts` ← imported by → route handlers + server components. `lib/session.ts` ← imported by → `lib/auth.ts` ← imported by → route handlers. `lib/session.ts` has zero imports from `lib/auth.ts` or `app/api/**`. No circular paths.
- **TanStack `staleTime`:** global default `30_000`. **Per-hook overrides** for auth/cart/orders → `staleTime: 0` so post-mutation invalidation refetches immediately.
- **State ownership:** filters/sort/search → URL search params (single source). product/cart/me/orders data → TanStack cache (single source). auth identity → iron-session cookie + mirrored `useMe` cache. No state duplicated across the two caches; the cookie is read-only on the client (via `/api/auth/me`).

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `better-sqlite3` native build under bun on macOS | Document `bun install` workflow; if it fails fall back to `npm install` once for the native module. Add to README troubleshooting. |
| Next 16 params/cookies API drift vs. training data | Always reread `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` (covers async `params` for pages and route handlers) and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` before authoring. |
| iron-session + edge runtime confusion | Pin route handlers to default Node runtime; never set `runtime = 'edge'`. |
| Concurrent stock decrement | `UPDATE … WHERE stock >= ?` inside a transaction (Wk 8). No two-phase reservation; documented as known limitation. |
| Seed image hosting | Bundle small JPGs in `public/seed-images/` (CC0). |
| `SQLITE_BUSY` under WAL during dev | Single-process dev server; WAL mode reduces lock contention. If hit, document `bun run db:reset` as the recovery. |
| `SESSION_SECRET` rotation | Invalidates every existing cookie → all users logged out. Documented in Wk 6 README block. |
| Missing `public/seed-images/` folder | `db:seed` warns + continues (no crash) and inserts a placeholder URL like `/seed-images/missing.jpg`. |

## 9. Deliverable for *this* task

After review pipeline completes, write 8 markdown files:

```
docs/sprints/week-01.md   Foundation & tooling
docs/sprints/week-02.md   DB layer + catalog API
docs/sprints/week-03.md   Homepage product grid
docs/sprints/week-04.md   Filter / sort / search
docs/sprints/week-05.md   Product detail page
docs/sprints/week-06.md   Authentication
docs/sprints/week-07.md   Cart
docs/sprints/week-08.md   Checkout & orders
```

Each follows the template in §5 and elaborates the matching subsection of §6.

## 10. Review Trail

### Metis Plan Consultant
- [x] Cache Components mode pinned OFF; legacy `dynamic = 'force-dynamic'` model confirmed (§2 constraints, §7).
- [x] `cookies()` async + exact `getIronSession(await cookies(), …)` signature spelled out (§6 Wk 6).
- [x] Route handler `params` Promise note added to cross-cutting (§7) and applied in Wk 7 / Wk 8 specs.
- [x] No `middleware.ts` / `proxy.ts` — explicit constraint (§2, §7).
- [x] ky error policy pinned: `throwHttpErrors: true` + parse + rethrow + toast (§6 Wk 1, §7).
- [x] Sort allowlist made concrete (§6 Wk 2).
- [x] Cart-helper stubs moved to Wk 6 to thin Wk 7 (§6 Wk 6, Wk 7).
- [x] `lib/db/queries.ts` introduced in Wk 2 — no mid-stream abstraction in Wk 5.
- [x] `validators.ts` extended (not recreated) in Wk 8.
- [x] `formatCurrency(cents)` no params.
- [x] `e2e/` left untouched; mentioned only in Wk 8 README.
- [x] Cart cross-browser QA reframed to "second profile on same machine".
- [x] Health route flagged "do not grow".

### Architect Reviewer
- [x] `orders.status` default → `'confirmed'` (no payment integration in demo).
- [x] Schema known-limitations block added to §3.
- [x] Indexes added to §3 + Wk 2.
- [x] Pagination defaults / hard cap pinned (§6 Wk 2).
- [x] Checkout txn now decrements `products.stock` with `WHERE stock >= ?` and 409s on race (§6 Wk 8).
- [x] `listCartItems` and orders-list specified as single-JOIN queries — no N+1 (Wk 7, Wk 8).
- [x] Server-vs-client data-flow rule added (§7 layer rules).
- [x] Logout/login cache hygiene pinned (§6 Wk 6).
- [x] Detail page declared public + `dynamic = 'force-dynamic'` (§6 Wk 5).
- [x] `staleTime: 0` overrides for `useMe`/`useCart` (§6 Wk 6, Wk 7, §7).
- [x] One-way module direction rule (§7 layer rules).
- [x] WAL / `SESSION_SECRET` / missing-seed-images failure modes added to §8.
- [x] Wk 7 / Wk 8 hard prereqs called out; Wk 5 noted as not requiring Wk 4.
- [x] `lib/api-client.ts` declared client-only (§7 layer rules).

### Momus Plan Reviewer
- [x] Bad doc path replaced (`dynamic-routes.md`, not `params.md`).
- [x] Demo creds literal pinned in Wk 6 login page spec (matches Wk 2 seed).
- [x] Wk 8 orders list explicitly links to `/checkout/success/[id]` — no separate `/orders/[id]` page.
- [x] Wk 7 `AddToCartButton` real-wiring spec keeps Wk 5 props and pins quantity source.
- [x] No must-fix blockers; plan ready to execute.
