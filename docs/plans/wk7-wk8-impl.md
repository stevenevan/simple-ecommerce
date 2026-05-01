# Implementation Plan — Week 7 (Cart) + Week 8 (Checkout & Orders)

Source-of-truth sprints: `docs/sprints/week-07.md`, `docs/sprints/week-08.md`.
Flattened into discrete, sequenced, file-level tasks. Each phase ends in one `/caveman-commit`-style conventional commit.

**DB layer:** All Wk7+8 query bodies use **[Kysely](https://github.com/kysely-org/kysely)** with `BetterSqlite3Dialect` (user decision; path b — hybrid). Wk1–6 sync raw-prepare queries (`listProducts`, `getUserByEmail`, etc.) are **left untouched** in this milestone. A follow-up phase backfills them after Wk8 ships. New queries are async (Kysely API is promise-based even on the sync better-sqlite3 driver) — route handlers `await` them. Locked stubs in `lib/db/queries.ts` change return types from `T` → `Promise<T>` (extension of D1's stub-refinement carve-out).

---

## 1. Context

Repo state (verified 2026-05-01):
- Branch `main`. `git status` shows `M lib/db/queries.ts` and untracked `app/api/auth/` — both already accounted for in last commit `e04c4f6` (auth/cart stubs landed). Working tree assumed clean before starting.
- DB schema (Wk 2 / `lib/db/migrate.ts`) has `users / products / carts / cart_items / orders / order_items` with FKs, `UNIQUE(cart_id, product_id)`, `CHECK (quantity > 0)`, `ON DELETE CASCADE` on `cart_items` and `order_items`, plus indexes on `cart_items.cart_id` and `orders(user_id, created_at DESC)`.
- `lib/db/queries.ts` exposes Wk 7 stubs that throw `Error('Week 7')`: `getOrCreateCart`, `listCartItems`, `upsertCartItem`, `updateCartItemQty`, `removeCartItem`. Signatures locked.
- `lib/types.ts` exports `CartItemView` with shape `{ id, productId, slug, name, image_url, price_cents, quantity, line_total_cents, stock }` — note `productId` (camelCase) and `line_total_cents` field.
- **Spec contradiction note (D18):** `week-07.md` Transition block says checkout is "hand-rolled (no react-hook-form, no zod); validators extend `lib/validators.ts`." This is **superseded** by `week-08.md` §In-scope task 1, which mandates TanStack Form + `checkoutShippingSchema` (Wk 4.5) and explicitly states `lib/validators.ts` is never created. Plan follows Wk 8.
- `lib/auth.ts` exports `ensureSession()` returning `Promise<SessionUser | Response>` (401 with `Cache-Control: no-store` on miss).
- `lib/api-client.ts` exports `api` (ky) with `prefix:'/api'`, `credentials:'include'`, `throwHttpErrors:true`.
- `lib/hooks/useMe.ts` returns `{ data: { user: SessionUser | null } | undefined, ... }`.
- `lib/hooks/useAuthMutations.ts` already invalidates `['cart']` on login and removes it on logout — Wk 7 cart query just needs `enabled: !!me?.user` to play nicely.
- `lib/schemas/checkout.ts` already exports `checkoutShippingSchema` + `CheckoutShippingInput` (zod v4, `name/address/city/zip` with trim+regex).
- `components/AddToCartButton.tsx` is the Wk 5 placeholder with locked props `{ productId, stock }` and a sign-in toast — body to be replaced in Wk 7.
- `components/Header.tsx` is a server shell with a `[data-slot="header-right"]` containing `<HeaderUserMenu />` (client). CartDrawer + Orders link slot in here.
- shadcn primitives installed: `aspect-ratio button badge card dropdown-menu field input label select separator skeleton tabs`. Missing: `sheet`, `dialog`, `textarea`.

Out-of-scope confirmation:
- No payments, no `/orders/[id]` route, no order cancellation, no admin UI, no e2e activation, no CSRF token system (lax-cookie + same-origin fetch is the documented model).

---

## 2. Phase Boundaries (one commit per phase)

| Phase | Scope | Commit |
|---|---|---|
| **7A** | Install Kysely (with user OK) + create `lib/db/kysely.ts` (typed `Database` interface + Kysely instance sharing the existing better-sqlite3 connection from `lib/db/index.ts`) + shadcn `sheet` install (with user OK) + cart query bodies (Kysely, async) + `getProductForCart` helper in `lib/db/queries.ts`. | `feat(cart)` |
| **7B** | Cart route handlers: `GET /api/cart`, `POST /api/cart/items`, `PATCH/DELETE /api/cart/items/[id]`. | `feat(api)` |
| **7C** | `lib/hooks/useCart.ts` + `lib/hooks/useCartMutations.ts` + `components/CartDrawer.tsx` + `AddToCartButton` body swap + `Header` mount. | `feat(cart)` |
| **8A** | shadcn `textarea` install + `getProductById` + `createOrderForUser` + `listOrdersForUser` + `getOrderForUser` in `lib/db/queries.ts`. | `feat(orders)` |
| **8B** | Order route handlers: `GET/POST /api/orders`, `GET /api/orders/[id]`. | `feat(api)` |
| **8C** | `lib/hooks/useOrders.ts` + `app/checkout/page.tsx` + `app/checkout/success/[id]/page.tsx` + `app/orders/page.tsx` + `Header` "Orders" link + README hand-off block. | `feat(checkout)` |

Order is strict: 7A → 7B → 7C → 8A → 8B → 8C. 7A's `getProductForCart` and cart bodies are consumed by 7B; 7C cart UI is a Wk 8 prereq for the checkout-summary section; 8A's `createOrderForUser` is consumed by 8B's `POST /api/orders`.

---

## 3. Phase 7A — Cart Queries

### 3.1 Pre-flight
- **ASK USER**: `bun add kysely`. Single dep, no peer-deps required. The `BetterSqlite3Dialect` ships in core `kysely`. If user declines, fall back to raw `better-sqlite3` queries (revert plan to pre-Kysely shape — non-trivial; ask first).
- **ASK USER**: `bunx shadcn@latest add sheet`. **First verify** whether the installed shadcn version pulls `dialog` automatically as a peer-dep (run `bunx shadcn@latest add sheet --dry-run` or read the `sheet.json` registry file). If `dialog` is auto-pulled, no separate ask. If not, drop `dialog` entirely — nothing in this plan consumes it (no YAGNI install). If user declines `sheet`, abort phase 7C and revisit. (D16)
- **(SEC #10)** Verify `lib/db/migrate.ts` has `UNIQUE(cart_id, product_id)` on `cart_items` BEFORE writing the `ON CONFLICT` clause in §3.3. Already verified at plan-draft time, but re-confirm in the running tree (`grep -n "UNIQUE" lib/db/migrate.ts`).
- **Read Kysely docs** before writing queries:
  - `https://kysely.dev/docs/getting-started?dialect=sqlite` — dialect setup with an existing `Database` instance.
  - `https://kysely.dev/docs/recipes/relations` — JOINs.
  - `https://kysely.dev/docs/recipes/transactions` — `db.transaction().execute(async (trx) => …)` API; better-sqlite3 dialect runs sync underneath but the API is promise-based.
  - `https://kysely.dev/docs/queries/insert#upsert` — `onConflict(...).doUpdateSet(...)` shape.
- Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` (already read for Wk 5/6; re-confirm async `params` signature is unchanged).
- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` for current `Response.json` patterns.

### 3.2 Files to edit

| Path | Action |
|---|---|
| `lib/db/kysely.ts` | **NEW.** Declares the `Database` interface (one table type per `migrate.ts` table) and exports `kdb: Kysely<Database>` instantiated with `BetterSqlite3Dialect({ database: getDb() })` — shares the existing connection from `lib/db/index.ts`. Server-only (already isolated by `lib/db/**` rule). |
| `lib/db/queries.ts` | Replace five cart stubs (now async via Kysely); add `getProductForCart` helper + exported `getCartLineQuantity` + `getCartItemOwnership` helpers (consumed by route handlers; see D3). Refine all five locked stubs from sync `T` → async `Promise<T>` (D1 extension); `updateCartItemQty` / `removeCartItem` further refine `void` → `number`. |

**D1 (extended) — Stub return-type refinement.** Wk 6 stubs declare sync return types (e.g., `void`, `CartItemView[]`). With Kysely the new bodies are async and return `Promise<T>`. Two refinements vs. the locked stubs:
1. All five stubs become async (`Promise<T>` return).
2. `updateCartItemQty` / `removeCartItem` go from `Promise<void>` → `Promise<number>` (rows affected) so route handlers map `0` → 404 without a separate existence-check round-trip.

No other signature changes.

### 3.2.1 `lib/db/kysely.ts` shape
```ts
import { Kysely, BetterSqlite3Dialect, type Generated } from 'kysely'
import { getDb } from './index.ts'

interface UsersTable {
  id: Generated<number>
  email: string
  password_hash: string
  name: string
  created_at: Generated<string>
}
interface ProductsTable {
  id: Generated<number>
  slug: string
  name: string
  description: string
  price_cents: number
  image_url: string
  category: string
  stock: number
  created_at: Generated<string>
}
interface CartsTable {
  id: Generated<number>
  user_id: number
  updated_at: Generated<string>
}
interface CartItemsTable {
  id: Generated<number>
  cart_id: number
  product_id: number
  quantity: number
}
interface OrdersTable {
  id: Generated<number>
  user_id: number
  total_cents: number
  shipping_name: string
  shipping_address: string
  shipping_city: string
  shipping_zip: string
  status: Generated<'confirmed'>
  created_at: Generated<string>
}
interface OrderItemsTable {
  id: Generated<number>
  order_id: number
  product_id: number
  name_snapshot: string
  price_cents_snapshot: number
  quantity: number
}

export interface Database {
  users: UsersTable
  products: ProductsTable
  carts: CartsTable
  cart_items: CartItemsTable
  orders: OrdersTable
  order_items: OrderItemsTable
}

export const kdb = new Kysely<Database>({
  dialect: new BetterSqlite3Dialect({ database: getDb() }),
})
```
Using `Generated<T>` for columns with DEFAULTs (auto-id, timestamps, status) so inserts can omit them. Single connection: better-sqlite3 instance is shared with the raw-prepare callers in `lib/db/queries.ts` — no duplicate WAL or connection contention.

### 3.3 Implementation

`getOrCreateCart(userId): Promise<{ id: number }>` — **no `kdb.transaction` wrapper** (Arch #3). The `carts.user_id UNIQUE` constraint plus better-sqlite3's synchronous-write serialization is sufficient.
```ts
import { kdb } from './kysely.ts'

export async function getOrCreateCart(userId: number): Promise<{ id: number }> {
  const row = await kdb.selectFrom('carts').select('id').where('user_id', '=', userId).executeTakeFirst()
  if (row) return row
  return kdb.insertInto('carts').values({ user_id: userId }).returning('id').executeTakeFirstOrThrow()
}
```

`listCartItems(cartId): Promise<CartItemView[]>` — single JOIN. Leading comment: `// Pure read. Reused inside createOrderForUser's transaction; do not add side effects.` (Arch #10). Must produce both `productId` (camelCase grandfathered alias — Arch #4) AND `line_total_cents` (computed) to match `CartItemView`:
```ts
import { sql } from 'kysely'

export async function listCartItems(cartId: number): Promise<CartItemView[]> {
  return kdb
    .selectFrom('cart_items as ci')
    .innerJoin('products as p', 'p.id', 'ci.product_id')
    .select([
      'ci.id as id',
      'ci.product_id as productId',
      'ci.quantity as quantity',
      'p.name as name',
      'p.price_cents as price_cents',
      'p.image_url as image_url',
      'p.stock as stock',
      'p.slug as slug',
      sql<number>`(p.price_cents * ci.quantity)`.as('line_total_cents'),
    ])
    .where('ci.cart_id', '=', cartId)
    .orderBy('ci.id')
    .execute()
}
```
Kysely's typed `select` catches column-name typos at compile time — partial replacement for D17's runtime smoke-test concern (the `sql` raw fragment for `line_total_cents` still needs the smoke-test). **No N+1.**

For use *inside* `createOrderForUser`'s transaction we'll need a trx-bound variant — see §6.5.

`upsertCartItem(cartId, productId, qty): Promise<void>` — single statement, no explicit transaction needed (single INSERT-or-UPDATE):
```ts
export async function upsertCartItem(cartId: number, productId: number, qty: number): Promise<void> {
  await kdb
    .insertInto('cart_items')
    .values({ cart_id: cartId, product_id: productId, quantity: qty })
    .onConflict((oc) =>
      oc.columns(['cart_id', 'product_id']).doUpdateSet({
        quantity: (eb) => eb('cart_items.quantity', '+', eb.ref('excluded.quantity')),
      }),
    )
    .execute()
}
```

`updateCartItemQty(itemId, cartId, qty): Promise<number>` — guard `qty <= 0` by throwing `Error('invalid_quantity')`; route handler catches and returns 400. **Scopes by `cart_id` to prevent cross-account tampering.**
```ts
export async function updateCartItemQty(itemId: number, cartId: number, qty: number): Promise<number> {
  if (qty <= 0) throw new Error('invalid_quantity')
  const r = await kdb
    .updateTable('cart_items')
    .set({ quantity: qty })
    .where('id', '=', itemId)
    .where('cart_id', '=', cartId)
    .executeTakeFirst()
  return Number(r.numUpdatedRows)
}
```

`removeCartItem(itemId, cartId): Promise<number>` — same `cart_id` scope.
```ts
export async function removeCartItem(itemId: number, cartId: number): Promise<number> {
  const r = await kdb
    .deleteFrom('cart_items')
    .where('id', '=', itemId)
    .where('cart_id', '=', cartId)
    .executeTakeFirst()
  return Number(r.numDeletedRows)
}
```

`getProductForCart(productId): Promise<Pick<Product,'id'|'price_cents'|'stock'> | null>`:
```ts
export async function getProductForCart(productId: number) {
  const row = await kdb
    .selectFrom('products')
    .select(['id', 'price_cents', 'stock'])
    .where('id', '=', productId)
    .executeTakeFirst()
  return row ?? null
}
```

Two more **exported** helpers (route handlers call exported helpers only; no raw `getDb()` or inline Kysely in route files — D3):
```ts
export async function getCartLineQuantity(cartId: number, productId: number): Promise<number> {
  const row = await kdb
    .selectFrom('cart_items')
    .select('quantity')
    .where('cart_id', '=', cartId)
    .where('product_id', '=', productId)
    .executeTakeFirst()
  return row?.quantity ?? 0
}

export async function getCartItemOwnership(itemId: number, cartId: number): Promise<number | null> {
  const row = await kdb
    .selectFrom('cart_items')
    .select('product_id')
    .where('id', '=', itemId)
    .where('cart_id', '=', cartId)
    .executeTakeFirst()
  return row?.product_id ?? null
}
```

### 3.4 Verify
- `bun run type:check` — passes.
- `bun run lint` — passes.
- Manual sanity (one-liner via `bun repl` or a throwaway script — do not commit): `getOrCreateCart(1)` returns `{id: 1}` first call and same id on second call.

### 3.5 Commit
`feat(cart): kysely setup + cart query bodies` (44)

---

## 4. Phase 7B — Cart Route Handlers

### 4.1 Files to create

| Path | Method(s) |
|---|---|
| `app/api/cart/route.ts` | `GET` |
| `app/api/cart/items/route.ts` | `POST` |
| `app/api/cart/items/[id]/route.ts` | `PATCH`, `DELETE` |

### 4.2 Common boilerplate (every handler)

```ts
export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_BODY_BYTES = 10_000
```

`ensureSession()` returns `SessionUser | Response`; check with `if (user instanceof Response) return user` immediately.

### 4.3 `GET /api/cart`
```ts
const user = await ensureSession()
if (user instanceof Response) return user
const cart = await getOrCreateCart(user.id)
const items = await listCartItems(cart.id)
const subtotalCents = items.reduce((s, i) => s + i.line_total_cents, 0)
return Response.json({ items, subtotalCents }, { headers: NO_STORE })
```
(D2: subtotal sums `line_total_cents` — single source of truth with the per-line value already in `CartItemView`.)
(Kysely: queries are async; `await` every call.)

### 4.4 `POST /api/cart/items`
Body: `{ productId: number, quantity: number }` (NO zod schema — two-field guard is cheaper than a schema file for now; spec did not request a `cartItemSchema`).
1. Body-size guard (`content-length > 10_000` → 413).
2. `ensureSession`.
3. Parse JSON; on parse fail → 400 `{ error: 'invalid_form' }`.
4. Validate `Number.isInteger(productId) && productId > 0` and `Number.isInteger(quantity) && quantity > 0` and `quantity <= 999` (sanity cap, prevents `Number.MAX_SAFE_INTEGER` shenanigans before DB round-trip) — else 400 `{ error: 'invalid_form' }`.
5. `const product = await getProductForCart(productId)` → 404 `{ error: 'not_found' }` if null.
6. `const cart = await getOrCreateCart(user.id)`.
7. `const existingQty = await getCartLineQuantity(cart.id, productId)` (exported helper from §3.3).
8. If `existingQty + quantity > product.stock` → 409 `{ error: 'insufficient_stock' }`.
9. `await upsertCartItem(cart.id, productId, quantity)`.
10. Return 200 `{ ok: true }`.

### 4.5 `PATCH /api/cart/items/[id]` and `DELETE /api/cart/items/[id]`
Signature: `({ params }: { params: Promise<{ id: string }> })`. Always `await params`.

**Layering note (Arch #2):** PATCH performs ownership-then-stock checks at the route layer with three statements (read product_id → read product stock → UPDATE), not in a single transaction. This asymmetry vs. `createOrderForUser` is intentional: cart mutations are best-effort UX feedback. The **authoritative** stock invariant lives in the order transaction's `UPDATE … WHERE stock >= ?` (§6.5). Any TOCTOU race between the route's stock-read and the UPDATE is corrected at checkout (oversold cart → 409 `insufficient_stock`). Do not refactor PATCH into a single composite transaction unless a real correctness need appears.

PATCH body `{ quantity: number }`:
1. Body cap, `ensureSession`, JSON parse.
2. Validate `Number.isInteger(quantity) && quantity >= 1 && quantity <= 999` → else 400 `invalid_form`.
3. `const itemId = Number(id)`; if `!Number.isInteger(itemId) || itemId <= 0` → 400.
4. `const cart = await getOrCreateCart(user.id)`.
5. `const productId = await getCartItemOwnership(itemId, cart.id)` (exported helper) → 404 if null (covers cross-cart tampering and stale ids in one shot — return `not_found`, not `forbidden`, per §9 policy).
6. `const product = await getProductForCart(productId)` → 404 if null (FK guarantees this normally; defensive).
7. If `quantity > product.stock` → 409 `insufficient_stock`.
8. `const changes = await updateCartItemQty(itemId, cart.id, quantity)` — if `changes === 0` → 404 (race where row was just deleted).
9. Return 200 `{ ok: true }`.

DELETE:
1. `ensureSession`, validate id.
2. `const cart = await getOrCreateCart(user.id)`.
3. `const changes = await removeCartItem(itemId, cart.id)` — if `0` → 404.
4. Return 200 `{ ok: true }`.

**Sec #1 (HIGH):** DELETE handler MUST NOT call `req.json()` — body is never read, so the body-cap check is unnecessary. Do not add a defensive `req.json()` just to satisfy a body-cap test. (§4.6 verify removes the DELETE body-cap expectation accordingly.)

### 4.6 Verify
- `curl -X POST http://localhost:3000/api/cart/items -d '{"productId":1,"quantity":1}' -H 'content-type:application/json'` → 401 (no cookie).
- After login (cookie via `--cookie-jar`), POST → 200; GET → shows the item with `subtotalCents` matching `price_cents * quantity`.
- POST with `quantity: 10000` → 400.
- POST with `quantity` exceeding `stock` → 409 with `{error:'insufficient_stock'}`.
- PATCH for an item id belonging to another user → 404 (NOT 403 — do not leak existence).
- DELETE returning 404 on stale id.
- (R3) `curl -X POST /api/cart/items` with `--data-binary "$(node -e 'process.stdout.write("{}".padEnd(100000))')"` and `content-length: 100000` header → 413. Repeat against `PATCH /api/cart/items/[id]`. **Do NOT test DELETE with a forged body-cap** (Sec #1) — DELETE never reads the body so a forged content-length is irrelevant; testing for "clean response" would push the implementer toward unnecessary `req.json()` calls.

### 4.7 Commit
`feat(api): cart endpoints w/ stock+ownership` (44)

---

## 5. Phase 7C — Cart UI

### 5.1 Files to create

| Path | Kind |
|---|---|
| `lib/hooks/useCart.ts` | client hook — **load-bearing** (Arch #5 reclassification). Checkout page (§8.3) treats `cart.isError` as a first-class branch with a Retry CTA; CartDrawer's badge hides on missing `data` (no `isError` toast needed — empty UI is informative enough). The hook itself does NOT toast; consumers decide visualization. Replaces D4's "decorative" classification — that label was contradicted as soon as a non-header consumer landed. |
| `lib/hooks/useCartMutations.ts` | client hooks — load-bearing. |
| `lib/hooks/_friendlyErrors.ts` | shared friendly-error map for cart + orders (Arch #9). Single source of truth so the maps cannot drift. Underscore-prefix marks it as a hook-local helper, not a public hook. |
| `components/CartDrawer.tsx` | client. |

### 5.2 `useCart`
```ts
'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { CartItemView } from '@/lib/types'
import { useMe } from './useMe'

export function useCart() {
  const { data: me } = useMe()
  return useQuery({
    queryKey: ['cart'],
    queryFn: () => api.get('cart').json<{ items: CartItemView[]; subtotalCents: number }>(),
    enabled: !!me?.user,
    staleTime: 0,
  })
}
```
Classification label inline (must be in the file's leading comment, per AGENTS.md — Arch #5):
```
// Load-bearing — does NOT toast itself; consumers decide visualization.
// CartDrawer hides the badge when data is missing (treats absence as zero).
// Checkout page renders cart.isError as a distinct branch with a Retry CTA.
// Mutation hooks (useCartMutations) carry their own toasts.
```

### 5.3 `useCartMutations` — three hooks
File-local `parseCartError` helper (mirrors `parseAuthError` from `useAuthMutations.ts`; same shape, file-local because each domain may evolve its own parsing):
```ts
async function parseCartError(e: unknown): Promise<Error> {
  if (e instanceof HTTPError) {
    const body = await e.response.json<{ error?: string }>().catch(() => null)
    return new Error(body?.error ?? `HTTP ${e.response.status}`)
  }
  return e instanceof Error ? e : new Error('Network error')
}
```

The friendly-error mapping lives in `lib/hooks/_friendlyErrors.ts` (Arch #9 — single source of truth, prevents drift between cart and orders maps):
```ts
// lib/hooks/_friendlyErrors.ts
export const friendlyErrors: Record<string, string> = {
  insufficient_stock: 'Not enough stock',
  unauthorized: 'Please sign in',
  not_found: 'Item no longer available',
  invalid_form: 'Invalid input',
  cart_empty: 'Your cart is empty',
  server_error: 'Something went wrong',
  payload_too_large: 'Request too large',
}
export const friendlyOf = (msg: string) => friendlyErrors[msg] ?? msg
```
Why a shared file rather than per-domain copies: cart and orders share most error tags (`insufficient_stock`, `unauthorized`, `not_found`); duplicating risks divergence (Arch #9). Why not consolidated with auth: auth's `parseAuthError` echoes server error strings directly (`'Invalid email or password'`), not enum tags — different contract.

Each hook on success: `qc.invalidateQueries({ queryKey: ['cart'] })` + `toast.success(...)`.
Each hook on error: `toast.error(friendlyOf(err.message))`.

| Hook | Signature | Success toast |
|---|---|---|
| `useAddItem` | `mutate({ productId, quantity })` → `POST /api/cart/items` | `'Added to cart'` |
| `useUpdateQty` | `mutate({ id, quantity })` → `PATCH /api/cart/items/${id}` | `'Cart updated'` |
| `useRemoveItem` | `mutate({ id })` → `DELETE /api/cart/items/${id}` | `'Removed'` |

### 5.4 `CartDrawer.tsx`
- `'use client'`. Imports shadcn `<Sheet>`, `<SheetTrigger>`, `<SheetContent>`, `<SheetHeader>`, `<SheetTitle>`, `<SheetFooter>`, `Button`, `Badge`, `useCart`, `useUpdateQty`, `useRemoveItem`, `useMe`, `formatCurrency` (from `lib/format.ts`), `safeProductImage` (from `@/lib/image`; D6 — file is server-and-client safe, depends only on the URL string), `useRouter`, `next/link`.
- Authed state (`me?.user` truthy — `useMe` is needed here for trigger `aria-label` / disabled-state branching, even though `useCart` `enabled` already keys off it; D7):
  - Trigger: `<Button variant="ghost" size="icon" aria-label="Open cart">` with cart icon (`ShoppingCart` from `lucide-react`) + `<Badge>` showing `data?.items.length ?? 0` when > 0.
  - `<SheetContent side="right" className="w-full sm:max-w-md">`.
  - Body: empty state `"Your cart is empty"` with link to `/`; otherwise `<ul>` of items showing a 64px `<img src={safeProductImage(item.image_url)} alt={item.name} width={64} height={64} />` thumbnail (do NOT pull `next/image` into the drawer; the existing `ProductImage` is sized for the 800px detail view), name (link to `/products/{slug}`), `formatCurrency(price_cents)`, `+`/`-` buttons (call `useUpdateQty`), trash button (call `useRemoveItem`). `+` disabled when `quantity >= stock` OR mutation pending. `-` disabled when `quantity <= 1` OR pending. (qty=0 is `Remove`, not `-`.)
  - Footer: `Subtotal: formatCurrency(subtotalCents)` + `<Button>Checkout</Button>` → `router.push('/checkout')`.
- Unauthed state: `<Button variant="ghost" size="icon" disabled aria-label="Sign in to use cart">` with cart icon + simple `title="Sign in to use cart"` HTML tooltip (do NOT pull in shadcn `tooltip` for a one-shot hover hint).

### 5.5 `AddToCartButton` body swap (props frozen)
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useMe } from '@/lib/hooks/useMe'
import { useAddItem } from '@/lib/hooks/useCartMutations'

type Props = { productId: number; stock: number }

export function AddToCartButton({ productId, stock }: Props) {
  const router = useRouter()
  const { data: me } = useMe()
  const addItem = useAddItem()
  const [qty, setQty] = useState(1)
  const clampedMax = Math.max(stock, 1)
  const clamped = Math.min(Math.max(qty, 1), clampedMax)

  const onAdd = () => {
    if (!me?.user) {
      toast.message('Sign in to add to cart', {
        action: { label: 'Sign in', onClick: () => router.push('/login') },
      })
      return
    }
    addItem.mutate({ productId, quantity: clamped })
  }

  if (stock === 0) {
    return <Button disabled>Out of stock</Button>
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" disabled={qty <= 1} onClick={() => setQty((q) => q - 1)}>−</Button>
      <span className="w-8 text-center tabular-nums">{clamped}</span>
      <Button variant="outline" size="icon" disabled={qty >= stock} onClick={() => setQty((q) => q + 1)}>+</Button>
      <Button onClick={onAdd} disabled={addItem.isPending}>
        {addItem.isPending ? 'Adding…' : 'Add to cart'}
      </Button>
    </div>
  )
}
```
**Props signature `{ productId, stock }` unchanged** — Wk 5 contract.

### 5.6 `Header.tsx` mount
Mount `<CartDrawer />` to the *left* of `<HeaderUserMenu />` inside the `data-slot="header-right"` wrapper. Wrap the right-side group in `<div className="flex items-center gap-2">`.

After Wk 7C the header-right slot reads:
```tsx
<div data-slot="header-right" className="flex items-center gap-2">
  <CartDrawer />
  <HeaderUserMenu />
</div>
```
After Wk 8C (D8) the slot reads:
```tsx
<div data-slot="header-right" className="flex items-center gap-2">
  <CartDrawer />
  <HeaderOrdersLink />
  <HeaderUserMenu />
</div>
```
Order: `[CartDrawer] [OrdersLink] [UserMenu]`. Wk 7C and Wk 8C edits accumulate; do not rewrite.

### 5.7 Verify (Wk 7 manual QA)
- Logged out → cart icon disabled with tooltip; `curl POST /api/cart/items` → 401.
- Logged in → add → toast + badge becomes 1.
- Open drawer → item shown.
- `+` → qty 2, subtotal doubles, refetch in DevTools.
- `+` clamps at stock; manual curl with `quantity: 9999` → 409.
- Remove → toast `Removed`; row disappears.
- Add second product → two rows; subtotal sums.
- Reload `/` → drawer reopens with same items.
- Cross-profile persistence test (Chrome regular + guest): same demo creds; add in A; reload B → both show item.
- Logout → drawer cleared, badge gone, `['cart']` query removed (DevTools).

### 5.8 Commit
`feat(cart): drawer + mutations + AddToCart` (42)

---

## 6. Phase 8A — Order Queries

### 6.1 Pre-flight
- **ASK USER**: `bunx shadcn@latest add textarea`. (`field`/`label` already installed in Wk 4.5.)
- Re-read `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`.

### 6.2 Files to edit

| Path | Action |
|---|---|
| `lib/types.ts` | Add `OrderRow`, `OrderItemSnapshot`, `OrderListItem` types (D10 — same boundary rule as `CartItemView`; client hooks and components consume these and MUST NOT import from `@/lib/db/**`). |
| `lib/db/queries.ts` | Add `createOrderForUser`, `listOrdersForUser`, `getOrderForUser` (all async, Kysely). Imports `OrderRow`/`OrderItemSnapshot`/`OrderListItem` from `@/lib/types` and `kdb` from `./kysely.ts`. |

### 6.3 Types (in `lib/types.ts`)

Prepend a leading comment block to `lib/types.ts` (Arch #4 — formalize the casing convention so the next plan doesn't relitigate it):
```ts
// Casing convention:
//  - Fields mirror DB column names (snake_case): image_url, price_cents, etc.
//  - Synthetic / computed fields stay snake_case for consistency: line_total_cents.
//  - `CartItemView.productId` is a grandfathered camelCase exception from Wk 6;
//    new types MUST NOT add camelCase fields. If a column must be exposed under
//    a different name, alias it in the SELECT and keep snake_case.
```
All order types below follow snake-only:
```ts
export type OrderItemSnapshot = {
  id: number
  product_id: number
  name_snapshot: string
  price_cents_snapshot: number
  quantity: number
}

export type OrderRow = {
  id: number
  user_id: number
  total_cents: number
  shipping_name: string
  shipping_address: string
  shipping_city: string
  shipping_zip: string
  status: 'confirmed'   // Arch #8 — literal type today; widen to a union when statuses appear
  created_at: string
}

export type OrderListItem = {
  id: number
  total_cents: number
  created_at: string
  item_count: number
}
```

### 6.4 `getProductById` — **dropped** (YAGNI). After D9 + R1, no caller exists in this milestone. The week-08 spec sample mentions it for the in-transaction re-read; that re-read is removed. Re-introduce later only when a real second caller appears.

### 6.5 `createOrderForUser(userId, shipping)` — single transaction (Kysely)
Throws tagged `Error` strings: `'cart_empty'`, `'insufficient_stock'`, `'total_overflow'`. Returns `Promise<{ id: number }>`.

```ts
import type { CheckoutShippingInput } from '@/lib/schemas/checkout'   // Arch #1 type-only
import { kdb } from './kysely.ts'
import { sql } from 'kysely'

export function createOrderForUser(
  userId: number,
  shipping: CheckoutShippingInput,
): Promise<{ id: number }> {
  return kdb.transaction().execute(async (trx) => {
    // R1 — inline cart lookup; do NOT call getOrCreateCart() (it opens its own connection
    // path against kdb, which would not participate in this trx and would deadlock or
    // miss the transaction's isolation. Always use the trx handle for any work inside).
    const cart = await trx
      .selectFrom('carts').select('id').where('user_id', '=', userId).executeTakeFirst()
    if (!cart) throw new Error('cart_empty')

    // Same JOIN as listCartItems, but bound to trx so it sees the transaction's view.
    const items = await trx
      .selectFrom('cart_items as ci')
      .innerJoin('products as p', 'p.id', 'ci.product_id')
      .select([
        'ci.id as id',
        'ci.product_id as productId',
        'ci.quantity as quantity',
        'p.name as name',
        'p.price_cents as price_cents',
        'p.image_url as image_url',
        'p.stock as stock',
        'p.slug as slug',
        sql<number>`(p.price_cents * ci.quantity)`.as('line_total_cents'),
      ])
      .where('ci.cart_id', '=', cart.id)
      .orderBy('ci.id')
      .execute()
    if (items.length === 0) throw new Error('cart_empty')

    // D9 — price snapshot uses it.price_cents from the JOIN; stock UPDATE doesn't
    // touch price_cents, a re-read would be wasted I/O.
    let totalCents = 0
    for (const it of items) {
      const r = await trx
        .updateTable('products')
        .set({ stock: sql`stock - ${it.quantity}` })
        .where('id', '=', it.productId)
        .where('stock', '>=', it.quantity)
        .executeTakeFirst()
      if (Number(r.numUpdatedRows) === 0) throw new Error('insufficient_stock')
      totalCents += it.price_cents * it.quantity
    }
    // Sec #3 — defensive overflow guard.
    if (!Number.isSafeInteger(totalCents)) throw new Error('total_overflow')

    const order = await trx
      .insertInto('orders')
      .values({
        user_id: userId,
        total_cents: totalCents,
        shipping_name: shipping.name,
        shipping_address: shipping.address,
        shipping_city: shipping.city,
        shipping_zip: shipping.zip,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await trx
      .insertInto('order_items')
      .values(
        items.map((it) => ({
          order_id: order.id,
          product_id: it.productId,
          name_snapshot: it.name,
          price_cents_snapshot: it.price_cents,
          quantity: it.quantity,
        })),
      )
      .execute()

    await trx.deleteFrom('cart_items').where('cart_id', '=', cart.id).execute()
    return order
  })
}
```
(Arch #8 forward-compat note) When real payments land (Stripe etc.), this single transaction splits into reserve → confirm with an `orders.status` state machine. The current shape assumes synchronous success; do not pre-build the split now.

Notes:
- `kdb.transaction().execute(async (trx) => …)` is Kysely's transaction API. Inside the callback, **all** queries must use `trx`, not `kdb` — using `kdb` would run outside the transaction and break atomicity (Kysely-specific gotcha; the spec-era `db.transaction()` wrapper had no such concern because it was function-scoped).
- `it.productId` (camelCase grandfathered alias) per `CartItemView` shape. The week-08 spec sample uses `it.product_id`, which is wrong; trust the alias.
- `sql\`stock - ${it.quantity}\`` is Kysely's tagged template for safe interpolation of a SQL expression (the `${}` is parameterized, not concatenated). Equivalent to `eb('stock', '-', it.quantity)` but reads cleaner here.
- `getProductById` is no longer needed inside `createOrderForUser` (D9 + R1). **Drop it from §6.4** — no caller in this milestone (YAGNI). Spec mentions it only as a helper for the now-removed re-read.

**Concurrency / deployment caveats (Sec #4 + Sec #5):**
- The `WHERE stock >= ?` clause is the **sole** defense against negative stock; the schema does not have `CHECK (stock >= 0)`. A future buggy UPDATE that drops the WHERE-guard would silently corrupt inventory. Consider adding `CHECK (stock >= 0)` to a future migration as defense-in-depth (out of scope for this milestone).
- D9 (price snapshot from JOIN, no re-read) is safe under better-sqlite3's synchronous, single-process model: the SELECT in `listCartItems` and the UPDATE loop run on the same JS event-loop tick inside a `db.transaction` (which upgrades to `BEGIN IMMEDIATE` on first write). If migrating to an async driver (libsql, Postgres) or a multi-process deployment, revisit — would need `SELECT … FOR UPDATE` or a row-lock equivalent on the products rows.
- The "exactly one wins" stock-race claim (verified in §8.8 QA) holds for single-process Node + better-sqlite3. Multi-process (PM2 cluster, multi-container) would still benefit from `db.transaction(...).immediate()` to force `BEGIN IMMEDIATE` and avoid deferred-mode races. Out of scope here; documented for future readers.

### 6.6 `listOrdersForUser(userId): Promise<OrderListItem[]>` — single query
```ts
export async function listOrdersForUser(userId: number): Promise<OrderListItem[]> {
  return kdb
    .selectFrom('orders as o')
    .leftJoin('order_items as oi', 'oi.order_id', 'o.id')
    .select([
      'o.id as id',
      'o.total_cents as total_cents',
      'o.created_at as created_at',
      sql<number>`COALESCE(SUM(oi.quantity), 0)`.as('item_count'),
    ])
    .where('o.user_id', '=', userId)
    .groupBy('o.id')
    .orderBy('o.created_at', 'desc')
    .execute()
}
```
**No per-row lookup.** **Intentionally unpaginated** for the demo (Arch #8).

### 6.7 `getOrderForUser(userId, orderId): Promise<{ order: OrderRow; items: OrderItemSnapshot[] } | null>`
Two queries (single SELECT each — O(1) for the order, O(n) JOIN-free for items):
```ts
export async function getOrderForUser(userId: number, orderId: number) {
  const order = await kdb
    .selectFrom('orders')
    .selectAll()
    .where('id', '=', orderId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  if (!order) return null
  const items = await kdb
    .selectFrom('order_items')
    .select(['id', 'product_id', 'name_snapshot', 'price_cents_snapshot', 'quantity'])
    .where('order_id', '=', orderId)
    .orderBy('id')
    .execute()
  return { order: order as OrderRow, items }
}
```
**Cross-user check is at the orders SELECT** (`user_id = ?`), so the items query is safe regardless of who owns the order_items rows.

### 6.8 Verify
- `bun run type:check` clean.
- `bun run lint` clean.

### 6.9 Commit
`feat(orders): queries + place-order tx` (38)

---

## 7. Phase 8B — Order Route Handlers

### 7.1 Files to create

| Path | Method(s) |
|---|---|
| `app/api/orders/route.ts` | `GET`, `POST` |
| `app/api/orders/[id]/route.ts` | `GET` |

### 7.2 `GET /api/orders`
```ts
const user = await ensureSession()
if (user instanceof Response) return user
const orders = await listOrdersForUser(user.id)
return Response.json({ orders }, { headers: NO_STORE })
```

### 7.3 `POST /api/orders`
1. Body cap (10KB) → 413.
2. `ensureSession` **before** `safeParse` — unauthed callers cannot probe schema shape.
3. Parse JSON → `checkoutShippingSchema.safeParse`. On fail → 400 `{ error:'invalid_form', fields: z.flattenError(parsed.error).fieldErrors }`.
4. **No client-side cart pre-check** (D11). `createOrderForUser` is the single source of truth and throws `cart_empty` itself; an extra `listCartItems` round-trip would be a redundant query and a TOCTOU race.
5. `try { const { id } = await createOrderForUser(user.id, parsed.data); return Response.json({ id }, { headers: NO_STORE }) } catch (e) { ... }`:
   - `e.message === 'cart_empty'` → 400 `{ error:'cart_empty' }`.
   - `e.message === 'insufficient_stock'` → 409 `{ error:'insufficient_stock' }`.
   - else → log via `console.error` and return 500 `{ error:'server_error' }` (do not leak the message).

### 7.4 `GET /api/orders/[id]`
```ts
const { id } = await params
const user = await ensureSession()
if (user instanceof Response) return user
const orderId = Number(id)
if (!Number.isInteger(orderId) || orderId <= 0) {
  return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
}
const data = await getOrderForUser(user.id, orderId)
if (!data) return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
return Response.json(data, { headers: NO_STORE })
```

### 7.5 Verify
- Body-cap curl with `--data-binary "$(node -e 'process.stdout.write(\"{}\".padEnd(100000))')"` → 413.
- POST with bad zip → 400 with `fields.zip` set.
- POST with empty cart → 400 `cart_empty`.
- POST while another session just consumed the last unit → 409.
- GET `/api/orders/[other-user-order-id]` → 404 (not 403).

### 7.6 Commit
`feat(api): order endpoints + tagged errors` (42)

---

## 8. Phase 8C — Checkout, Success, Orders pages + README

### 8.1 Files to create / edit

| Path | Kind |
|---|---|
| `lib/hooks/useOrders.ts` | client hooks (`useOrders`, `useCreateOrder`). |
| `app/checkout/page.tsx` | client. |
| `app/checkout/success/[id]/page.tsx` | server (canonical order detail). |
| `app/checkout/success/[id]/OrderSummary.tsx` | server presentational. |
| `app/orders/page.tsx` | client. |
| `components/Header.tsx` | edit — add "Orders" link when authed. |
| `README.md` | append hand-off block. |

### 8.2 `lib/hooks/useOrders.ts`
- File leading comment must declare classification (D14):
  ```
  // Load-bearing — /orders page renders nothing without this query; errors
  // MUST be visible (error panel + retry CTA), not silenced.
  ```
- `useOrders` → `useQuery({ queryKey:['orders'], enabled: !!me?.user, staleTime: 0 })`. Type: `{ orders: OrderListItem[] }` imported from `@/lib/types`.
- `useCreateOrder` → `useMutation`. `mutationFn` POSTs `checkoutShippingSchema`-validated input, parses `HTTPError` via file-local `parseOrderError` (same shape as `parseCartError`). `onSuccess`: invalidate `['orders']` AND `['cart']`, `toast.success('Order placed')`. `onError`: `toast.error(friendlyOf(err.message))` — `friendlyOf` is **imported from `@/lib/hooks/_friendlyErrors`** (Arch #9 — shared with cart, no duplication). `cart_empty` and `server_error` are already in the shared map; do not redefine.

### 8.3 `app/checkout/page.tsx`
- `'use client'`. Imports `useForm`, `checkoutShippingSchema`, `useCart`, `useMe`, `useCreateOrder`, `useRouter`, `useEffect`, `Field`/`FieldLabel`/`FieldError`/`FieldGroup`, `Input`, `Textarea`, `Button`, `Card`, `formatCurrency`, `Link`.
- Guards inside `useEffect`:
  - If `me.isFetched && !me.data?.user` → `router.replace('/login')`.
  - (D12) Flash-of-skeleton-before-redirect is **expected and intentional**; this page is client-only by design. A server-side `getSession()` wrapper would avoid the flash but is out of scope.
- Render branches (D5 — `cart.isError` is a distinct branch, NOT collapsed into empty-cart):
  - `me.isLoading || cart.isLoading` → skeleton.
  - `cart.isError` → error panel ("Couldn't load your cart") with a Retry button calling `cart.refetch()`. Submit is hidden.
  - `cart.data?.items.length === 0` → empty-state panel with CTA to `/`.
  - Else → two-column layout: read-only summary on left (image, name, qty × price, line total, subtotal); shipping form on right.
- Form (mirror Wk 6 login pattern). **D13 + R4** — wrap `mutateAsync` in try/catch so a rejection (e.g., `insufficient_stock`) doesn't surface as an unhandled-promise warning; the mutation's `onError` already toasted, so the catch body is intentionally empty:
```tsx
const form = useForm({
  defaultValues: { name:'', address:'', city:'', zip:'' } satisfies CheckoutShippingInput,
  validators: { onChange: checkoutShippingSchema },
  onSubmit: async ({ value }) => {
    try {
      const { id } = await createOrder.mutateAsync(value)
      router.push(`/checkout/success/${id}`)
    } catch {
      // Toast already fired in useCreateOrder.onError; swallow here so
      // TanStack Form doesn't bubble it as an unhandled rejection.
    }
  },
})
```
- `address` → `<Textarea>`; `name`/`city`/`zip` → `<Input>`. Each wrapped in `<Field data-invalid={isInvalid}>` with `<FieldLabel>` + `<FieldError errors={field.state.meta.errors}>`.
- Submit gated:
```tsx
<form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
  {([canSubmit, isSubmitting]) => (
    <Button
      type="submit"
      disabled={!canSubmit || isSubmitting || (cart.data?.items.length ?? 0) === 0}
    >
      {isSubmitting ? 'Placing order…' : 'Place order'}
    </Button>
  )}
</form.Subscribe>
```
- (R2) Form does not need an explicit reset on success — the user is redirected to `/checkout/success/[id]` and `useCart` invalidation drops the cached cart. If they hit the back button, `useCart` refetches an empty cart and the empty-state panel shows; the stale form values are visible but the submit is disabled (cart-empty guard). Acceptable for this milestone.

### 8.4 `app/checkout/success/[id]/page.tsx` — server, canonical order detail
```tsx
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getOrderForUser } from '@/lib/db/queries'
import { OrderSummary } from './OrderSummary'

export const dynamic = 'force-dynamic'

export default async function SuccessPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const orderId = Number(id)
  if (!Number.isInteger(orderId) || orderId <= 0) notFound()
  const session = await getSession()
  if (!session.user) redirect('/login')
  const data = await getOrderForUser(session.user.id, orderId)
  if (!data) notFound()
  return <OrderSummary order={data.order} items={data.items} />
}
```
`OrderSummary.tsx` (server, sibling): renders shipping address block + item table (snapshot name, snapshot unit price, qty, snapshot line total) + total + CTA `<Link href="/">Back to all products</Link>` and `<Link href="/orders">View all orders</Link>`.

### 8.5 `app/orders/page.tsx` — client
- `useOrders()`. Loading skeleton. Empty state `"You have no orders yet"` with CTA to `/`.
- Render rows as `<Link href={"/checkout/success/" + id}>` blocks: created date, item count, formatted total. Newest first (server already orders DESC).

### 8.6 `Header.tsx` edit
Pass authed flag down. Cleanest approach without prop-drilling: convert Header into a client component? **No** — keep server-rendered shell. Instead, add a small `<HeaderOrdersLink />` client component (next to `HeaderUserMenu`) that uses `useMe` and renders `null` when unauthed; renders `<Link href="/orders">Orders</Link>` when authed. Place between `<CartDrawer />` and `<HeaderUserMenu />`.

### 8.7 README hand-off block (append, do not rewrite existing)
```md
## Hand-off

Demo creds: `demo@example.com` / `Demo1234!`.
Prereq: Node 24 (`.nvmrc` provided; `nvm use` if available).

```bash
node --version          # v24.x.x
bun install
cp .env.example .env    # then set SESSION_SECRET (32+ chars)
bun run db:reset
bun dev
```

### Known limitations
- Single currency (USD).
- No real payment integration; `orders.status` defaults to `'confirmed'`.
- Stock race protection is a single-row `UPDATE … WHERE stock >= ?` inside a transaction (no two-phase reservation).
- Cart-drawer prices are advisory; the order is charged at the price at the moment of submit (snapshotted into `order_items.price_cents_snapshot`).
- No email verification, no password reset.
- `/orders` is unpaginated (full history per request).
- `e2e/` directory exists but is unused in this milestone.
```

### 8.8 Verify (Wk 8 manual QA — full sweep)
- Happy path: logout → fresh login → browse → filter → detail → add 2 → drawer → checkout → fill form (`Test User`, `123 Demo St`, `Springfield`, `12345`) → submit → land on `/checkout/success/<id>`.
- After success: cart drawer empty, `/orders` lists the new order, click → routes back to `/checkout/success/<id>`.
- Hard-reload `/orders` and `/checkout/success/<id>` — both persist.
- Validation: clear `zip`, submit disabled; curl bypass with `zip:"abc"` → 400 with `fields.zip`.
- Body-cap: 100KB POST → 413.
- Empty-cart guard: client shows panel; curl POST → 400 `cart_empty`.
- Stock race (two profiles, last unit): exactly one succeeds; other gets `Not enough stock` toast; `sqlite3 data/app.db "SELECT stock FROM products WHERE id=…"` confirms `0` (not `-1`).
- Order isolation: user A's order id requested as user B → 404.
- Snapshot integrity: after order, `UPDATE products SET price_cents = 99999`; reload success page → totals unchanged.
- Header shows "Orders" link only when authed.
- `bun run lint` clean; `bun run type:check` clean.

### 8.9 Commit
`feat(checkout): form + success + orders` (39)

---

## 9. Cross-cutting decisions (locked)

- **No CSRF token system.** Same-origin lax cookie + `fetch credentials:'include'` + ky `prefix:'/api'` is the project's documented model (Wk 6 baseline). 403 vs 404 policy: cross-account references **always** return 404, never 403, to avoid existence leakage.
- **No rate-limiting middleware** in this milestone (single-user demo). Body-size cap (10KB) and integer/range guards are the only DoS mitigations on cart/order POSTs.
- **No `cartItemSchema` zod file.** Two integer fields + range guards inline are cheaper than a schema module that nothing else consumes. Note: `checkoutShippingSchema` exists (Wk 4.5) and **is** reused — that's the threshold.
- **`lib/db/queries.ts` may import `lib/schemas/checkout.ts`** — `lib/schemas/**` is shared client/server (per AGENTS.md) and only depends on `zod`. Confirmed safe.
- **`CartDrawer` thumbnails use a plain `<img>`**, not `next/image`. Reason: `ProductImage` is sized for 800px detail view; pulling `next/image` for a 64px drawer thumbnail is overkill and image-domain config is already-set for `next/image` callers only.
- **Phase commits stand alone** — each phase's `bun run type:check` + `bun run lint` must pass before the commit. If a later phase needs to mutate something from a previous phase's surface, push that as a fixup commit, not an amend.
- **(D15, refined per Arch #6) `<HeaderOrdersLink />` is a top-level header element, not part of the user-identity dropdown.** Wk 8C adds a 10-line client component that uses `useMe` to render `null` (unauthed) or `<Link href="/orders">Orders</Link>` (authed). The alternative — co-locating Orders inside `HeaderUserMenu` (already a client component) — would conflate site nav with auth UI; the visual placement is between Cart and the user-identity dropdown, not inside it. Converting `Header` itself to a client component is also rejected (would pull the entire shell into the client bundle).
- **(D10) Shared types live in `lib/types.ts`.** Order types (`OrderRow`, `OrderItemSnapshot`, `OrderListItem`) follow the `CartItemView` pattern. `lib/db/queries.ts` imports them; client hooks/components import from `@/lib/types` only — never from `@/lib/db/**` (AGENTS.md hard rule).
- **(R1) No nested transactions.** `createOrderForUser` inlines the cart-id lookup using the `trx` handle; it never calls `getOrCreateCart` (which uses the top-level `kdb`). With Kysely the failure mode is more subtle than with raw better-sqlite3: a `kdb` query inside a `trx` callback runs **outside** the transaction (no error, but no atomicity either) — strictly worse than a hard throw. Always use `trx` inside `kdb.transaction().execute(...)`.
- **(Kysely hybrid — user-elected path b)** Wk7+8 query bodies use Kysely; Wk1–6 sync raw-prepare queries (`listProducts`, `getUserByEmail`, `insertUser`, `getProductBySlug`, `listCategories`) stay as-is. `lib/db/queries.ts` becomes mixed (sync + async). The single better-sqlite3 connection is shared via `BetterSqlite3Dialect({ database: getDb() })` — no double WAL, no double migration. **Follow-up task** (out of scope for this milestone): backfill the Wk1–6 helpers to Kysely once Wk7+8 lands; routes that consume them become `await`-d. Track via the `/schedule` skill if desired.

---

## 10. Pre-commit checklist (every phase)

- [ ] `bun run type:check` passes.
- [ ] `bun run lint` passes.
- [ ] No `console.log` / `debugger` / commented-out code in diff.
- [ ] No new files outside the phase scope.
- [ ] `git status` shows only files in the phase table.
- [ ] Commit message follows `/caveman-commit` style: conventional, subject ≤50 chars, body only when "why" non-obvious.
- **(D17, narrowed) Phases 7A and 8A only:** Kysely's typed query builder catches **column-name typos** at compile time (big partial win vs. raw prepares). The remaining runtime risk is the `sql\`...\`` raw fragments (`(p.price_cents * ci.quantity) AS line_total_cents`, `COALESCE(SUM(oi.quantity), 0) AS item_count`, `stock - ?`). Run a one-shot smoke-test before committing 7A and 8A that exercises each `sql\`...\`` path and asserts the returned shape matches `CartItemView` / `OrderListItem`. Delete the script afterward; do not commit it.

---

## 11. Review Trail

### Metis Plan Consultant
- [x] D1 — stub return-type refinement documented (§3.2).
- [x] D2 — subtotal uses `line_total_cents` (§4.3).
- [x] D3 — exported `getCartLineQuantity` + `getCartItemOwnership` helpers; no raw SQL in route files (§3.3, §4.4, §4.5).
- [x] D4 — `useCart` classified decorative inline (§5.1, §5.2).
- [x] D5 — checkout page treats `cart.isError` as distinct branch (§8.3).
- [x] D6 — `safeProductImage` import path documented (§5.4).
- [x] D7 — `useMe` retained in CartDrawer for trigger aria-label (§5.4).
- [x] D8 — final `header-right` slot layout shown for both 7C and 8C (§5.6).
- [x] D9 — price snapshot uses `it.price_cents` (no re-read) (§6.5).
- [x] D10 — Order types moved to `lib/types.ts` (§6.2, §6.3, §9).
- [x] D11 — pre-check `cart_empty` removed; rely on transaction-thrown tag (§7.3).
- [x] D12 — useEffect-redirect flash documented as intentional (§8.3).
- [x] D13 + R4 — `mutateAsync` wrapped in try/catch in `onSubmit` (§8.3).
- [x] D14 — `useOrders` classified load-bearing (§8.2).
- [x] D15 — `<HeaderOrdersLink />` island decision logged (§9).
- [x] D16 — `dialog` shadcn install verified before adding to ask (§3.1).
- [x] D17 — runtime smoke-test added to pre-commit for 7A and 8A (§10).
- [x] D18 — week-07 spec contradiction note added (§1).
- [x] R1 — `createOrderForUser` no longer nests `db.transaction` (§6.5, §9).
- [x] R2 — form-reset behavior documented (§8.3).
- [x] R3 — body-cap verify added for cart endpoints (§4.6).

### Architect Reviewer
- [x] Arch #1 — type-only import for `CheckoutShippingInput` (§6.5).
- [x] Arch #2 — PATCH layering asymmetry documented (§4.5).
- [x] Arch #3 — `db.transaction` wrapper dropped on `getOrCreateCart` (§3.3).
- [x] Arch #4 — casing convention codified in `lib/types.ts` leading comment (§6.3).
- [x] Arch #5 — `useCart` reclassified load-bearing (§5.1, §5.2).
- [x] Arch #6 — D15 rationale rewritten (§9).
- [x] Arch #7 — Phase 7C cohesion confirmed; no split.
- [x] Arch #8 — Stripe forward-compat note (§6.5), `status: 'confirmed'` literal type (§6.3), unpaginated `/orders` documented (§6.6, §8.7).
- [x] Arch #9 — `lib/hooks/_friendlyErrors.ts` shared map (§5.1, §5.3, §8.2).
- [x] Arch #10 — `listCartItems` pure-read comment (§3.3).

### Security Auditor
- [x] Sec #1 (HIGH) — DELETE handler must not parse body; verify step removed (§4.5, §4.6).
- [x] Sec #2 (LOW, accepted) — body-cap-before-auth ordering matches existing routes; documented as accepted info-leak (kept §7.3 as-is).
- [x] Sec #3 (MED) — `Number.isSafeInteger(totalCents)` overflow guard (§6.5).
- [x] Sec #4 (MED) — `CHECK (stock >= 0)` defense-in-depth note (§6.5).
- [x] Sec #5 (MED) — D9 deployment-model caveat (§6.5).
- [x] Sec #6 (LOW, accepted) — cart upsert race past stock; checkout transaction is authoritative (already covered in §4.5 layering note).
- [x] Sec #7 (LOW, accepted) — no `Content-Type` validation; lax-cookie + same-origin sufficient.
- [x] Sec #8 (LOW, accepted) — non-transactional stock read in cart upsert; checkout enforces.
- [x] Sec #9 (INFO) — error-mapping exhaustiveness verified (§7.3).
- [x] Sec #10 (INFO) — UNIQUE constraint pre-flight check added (§3.1).
- [x] Sec #11 (INFO) — `safeProductImage` SSRF/XSS surface analyzed; spot-check during impl.
- [x] Sec #12 (INFO) — server-side success page authn correct (§8.4).
- [x] Sec #13 (INFO) — session lifecycle untouched outside `lib/session.ts`.
- [x] Sec #14 (INFO) — PATCH ownership race is UX-only.

### Momus Plan Reviewer
- [x] All "exists today" file references verified at named paths (queries.ts, types.ts, auth.ts, api-client.ts, useMe.ts, useAuthMutations.ts, schemas/*, migrate.ts, Header.tsx, HeaderUserMenu.tsx, AddToCartButton.tsx, products/[slug]/page.tsx, api/auth/*, image.ts, format.ts, session.ts, ui/*).
- [x] `CartItemView` exact shape match confirmed (camel `productId` exception verified).
- [x] `lib/db/migrate.ts` schema match: `UNIQUE(cart_id, product_id)`, `CHECK (quantity > 0)`, `ON DELETE CASCADE`, indexes confirmed.
- [x] All five over-length commit subjects shortened to ≤50 chars (§4.7, §5.8, §6.9, §7.6, §8.9).
- [x] No internal contradictions; phase file lists cohere with task bodies.
- [x] No blocker findings. Plan execution-ready.

### User Decision — Kysely (post-momus)
- [x] Path **(b)** — Wk7+8 use Kysely; Wk1–6 raw-prepare untouched; backfill is a future follow-up.
- [x] All cart query bodies (§3.3) rewritten as async Kysely.
- [x] `createOrderForUser`, `listOrdersForUser`, `getOrderForUser` rewritten as async Kysely (§6.5–§6.7).
- [x] `lib/db/kysely.ts` added to phase 7A file list (§3.2 + §3.2.1 shape).
- [x] All consumers (`§4.3`, `§4.4`, `§4.5`, `§7.2`, `§7.3`, `§7.4`, `§8.4`) updated to `await` async query results.
- [x] D1 extended: stub return-type refinement now also covers sync→async (`T` → `Promise<T>`).
- [x] R1 restated for Kysely semantics (use `trx`, not `kdb`, inside the transaction callback).
- [x] D17 narrowed: Kysely catches column typos; only `sql\`...\`` raw fragments still need runtime smoke-test.
- [x] §7A commit subject updated: `feat(cart): kysely setup + cart query bodies`.
- [x] Hybrid pattern + backfill follow-up documented in §9.
