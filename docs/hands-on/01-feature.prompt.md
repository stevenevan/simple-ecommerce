## INTENT

Add per-item selection to the cart so only checked items are placed into the order.

## CONTEXT

- Stack: Next.js 16.2 App Router, React 19, TanStack Query v5, TanStack Form v1, zod v4, better-sqlite3, shadcn/ui, iron-session.
- This repo's `AGENTS.md` is binding — read it before designing.
- Files in scope:
  - `app/_components/CartDrawer.tsx` — drawer UI, current per-row controls (qty +/−, remove). **Selection UI lives here only** — the new `Checkbox` per row goes in the drawer.
  - `app/checkout/page.tsx` — checkout form + order-summary list. **No checkbox UI here.** The order summary list filters down to the selected items (drops unchecked rows from the rendered list and from the displayed subtotal); the form's Place-order button disables when zero rows are selected.
  - `app/checkout/_hooks/useCreateOrder.ts` — TanStack mutation calling `POST /api/orders`.
  - `app/api/orders/route.ts` — `POST` handler; runs `checkoutShippingSchema.safeParse` then `createOrderForUser(user.id, parsed.data)`.
  - `lib/schemas/checkout.ts` — `checkoutShippingSchema` (name/address/city/zip).
  - `lib/hooks/useCart.ts` — `CART_KEY` query, returns `{ items: CartItemView[]; subtotalCents }`.
  - `lib/db/queries.ts` — `createOrderForUser` (function name; read it before designing the server side).
  - `lib/types.ts` — `CartItemView` shape (`id`, `productId`, `quantity`, `line_total_cents`, etc.).
- Selection state lives **client-side only**. Do not persist selection to the DB. Default state = all rows selected (preserves existing UX for users who don't engage with the new control). Newly added cart items default to selected too — reconcile when the cart row set changes (add/remove).
- `GET /api/orders/:id` returns `{ order, items }` where `items: OrderItemSnapshot[]` — fields `product_id`, `name_snapshot`, `price_cents_snapshot`, `quantity`. The Playwright spec in the next prompt will assert against this shape; do not rename it.
- Existing integration tests for `createOrderForUser` (`tests/integration/db/queries.test.ts`) call the function directly and **will break** when its signature changes. Updating them in this turn is in scope; treat the existing assertions as the contract to keep green.

## CONSTRAINTS

- Do not change cart-item DB schema (`cart_items` table untouched). No new migration.
- `lib/schemas/**` may import only from `zod` — no `@/lib/db/**`, no `next/*` server APIs, no `'use client'` / `'use server'` pragmas. (See `AGENTS.md`.) Add an optional `selectedItemIds: number[]` to `checkoutShippingSchema` _or_ introduce a sibling schema (e.g. `placeOrderSchema = checkoutShippingSchema.extend({ selectedItemIds: ... })`) — pick one and justify the choice in the plan.
- `lib/types.ts`, `lib/hooks/**`, `components/**` MUST NOT import `@/lib/db/**`.
- The repo's UI primitives wrap **Base UI** (`@base-ui/react`), not Radix. A `Checkbox` primitive already ships at `components/ui/checkbox.tsx` — import it from `@/components/ui/checkbox`. Use its Base UI API: `<Checkbox checked={...} onCheckedChange={(v) => ...} aria-label="..." />` where `v` is `boolean | 'indeterminate'`. Do **not** roll a plain `<input type="checkbox">` and do **not** install Radix.
- No other new dependencies.
- `useCreateOrder` mutation's input type currently is `CheckoutShippingInput`; update it to whatever the new schema's inferred type is (`PlaceOrderInput` if you go with the sibling-schema option). The `app/checkout/page.tsx` form's `onSubmit` and `useCreateOrder.mutateAsync` call site must pass `selectedItemIds` from the selection store.
- Out of scope: persistence of selection across sessions, multi-cart, partial-stock UI redesign, payment integration.

## ACCEPTANCE

1. **All rows checked by default** → existing happy path is preserved: open cart with N items, do not touch checkboxes, click Checkout, place order → resulting `orders.order_items` contains all N products. (No regression in `tests/e2e/happy-path.spec.ts`.)
2. **Uncheck one row in drawer** → drawer subtotal recomputes immediately, dropping that row's `line_total_cents`. Navigating to `/checkout` shows the order-summary list with the unchecked row absent and the subtotal matching the drawer.
3. **Place order with one row unchecked** → `POST /api/orders` body carries `selectedItemIds` excluding that product → response 200 → `GET /api/orders/:id` response body's `items` array does NOT include the unchecked product → `cart_items` table still contains the unchecked row after the order succeeds (cart row is preserved, only the ordered subset is consumed).
4. **Uncheck all rows** → drawer Checkout button disabled, `/checkout` page Place-order button disabled (button stays disabled while zero rows are selected). `/checkout` order-summary list shows an empty state ("No items selected — open the cart to choose what to check out" or equivalent).
5. **Direct API call with empty `selectedItemIds`** → `POST /api/orders` returns 400 with explicit error code `nothing_selected` (or whichever code the plan chooses; name it explicitly in the plan and use the same code in the test prompt).
6. **`useCart` query response shape unchanged on the wire** → no field added or removed from `GET /api/cart` response. Selection state is purely client-side (e.g. `useState` in the drawer, lifted to a query-cache slice or a small context if both drawer and `/checkout` need to read it; pick the simpler option in the plan).

## FORMAT

- Run `/plan-with-review`. When it asks for middle reviewers, answer **d** (skip).
- After the plan is approved by metis + momus, implement the change.
- Do **not** author _new_ tests in this turn — tests are a separate prompt in a fresh session. Updating the existing `tests/integration/db/queries.test.ts` callers to match the new `createOrderForUser` signature **is** in scope (per the CONTEXT note above).
- Stop after `npx tsc --noEmit` is clean and `bun vitest run` is green. Do not run Playwright in this turn.
