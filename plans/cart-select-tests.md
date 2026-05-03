# Plan: Cart-select tests (Vitest unit + Playwright e2e)

## Context

Feature `feat/01-cart-selection` adds per-item checkbox selection in `CartDrawer`,
gates checkout subtotal + place-order on the selected subset, and persists the
choice across navigation via `useCartSelection` (TanStack-Query-as-store).
Production diff already landed in commit `7f4cc73`. This task adds tests only.

Production touch points (read-only context for tests):
- `lib/schemas/checkout.ts` — `placeOrderSchema = checkoutShippingSchema.extend({ selectedItemIds: z.array(z.number().int().positive()) })`. Comment says empty-array is intentionally schema-valid; the `nothing_selected` 400 is raised in the transaction layer.
- `lib/db/queries.ts::createOrderForUser` — filters `allItems` by `selectedItemIds`, throws `nothing_selected` if filter empty, deletes only consumed `cart_items` rows.
- `app/api/orders/route.ts` — POST validates with `placeOrderSchema`; maps `nothing_selected` → 400, `insufficient_stock` → 409.
- `app/api/orders/[id]/route.ts` — GET returns `{ order: OrderRow, items: OrderItemSnapshot[] }` (session-scoped).
- `app/_components/CartDrawer.tsx` — checkbox per row (`aria-label="Select <name>"`); footer subtotal = sum of selected `line_total_cents`; Checkout button disabled when no row selected.
- `app/checkout/page.tsx` — same selection filter; submits `{ ...shipping, selectedItemIds: selectedItems.map(it=>it.id) }`.

Existing fixtures (no new helpers per CONSTRAINTS):
- `tests/fixtures/db.ts`: `resetDb`, `insertCartItemDirect(userId, productId, qty)`, `getProductStock`, `getUserIdByEmail`, `getLatestOrderForUser`, `countOrders`.
- `tests/fixtures/seed.ts`: products `id=1` ($10, stock 5), `id=2` ($5, stock 1), slugs `p1`, `p2`.

## Files to add

1. `tests/unit/cart-select.test.ts` — three deterministic Vitest assertions.
2. `tests/e2e/cart-select.spec.ts` — one Playwright spec.

## Acceptance assertions (verbatim from prompt)

### Unit (Vitest) — `tests/unit/cart-select.test.ts`

A. `subtotal recomputes when one row is excluded`
   - Build two `CartItemView` rows (use real shape from `lib/types.ts`): row A id=10 line_total_cents=1000, row B id=20 line_total_cents=500.
   - `selected = new Set([10])` → expected = 1000.
   - No `selectedSubtotalCents` helper exists in production (the reduce is inlined in `CartDrawer.tsx` and `app/checkout/page.tsx`). **Per acceptance text, inline a 3-line pure mirror inside the test file** — `(items, selected) => items.filter(i => selected.has(i.id)).reduce((s,i)=>s+i.line_total_cents,0)`. Add inline comment: importing from `app/checkout/page.tsx` would drag React/Next runtime into a pure unit test.
   - Test data: minimal object literals + `as CartItemView` cast (the type has 9 required fields, no optionals; cast keeps fixture noise out of the assertion).
   - `expect(subtotal).toBe(1000)`. Pure, no jsdom, no RTL.

B. `schema rejects empty selectedItemIds`
   - Use a named `ok` const at top of the `describe('placeOrderSchema', ...)` block: `{ name: 'Jane', address: '1 St', city: 'NYC', zip: '12345', selectedItemIds: [1] }` (mirrors the `schemas.test.ts` convention).
   - `placeOrderSchema.safeParse({ ...ok, selectedItemIds: [] }).success === false`.
   - Current production schema accepts `[]` by design (comment: "empty array is schema-valid by design; do not add `.min(1)`"). Per the prompt's decision rule §3, the test mirrors the acceptance text literally; if it goes red, patch production with `.min(1)` on the inner array (single token).
   - **Contract delta** — the route handler in `app/api/orders/route.ts` currently maps the transaction's `nothing_selected` error to `400 { error: 'nothing_selected' }`. Adding `.min(1)` re-routes empty-selection failures to the schema layer, which returns `400 { error: 'invalid_form', fields: { selectedItemIds: [...] } }` instead. Verified `app/checkout/page.tsx` and `useCreateOrder` do not branch on the `nothing_selected` string — UI path unaffected. Direct API consumers would see the new shape. The `.min(1)` patch must be documented in the commit message; the existing route-layer mapping becomes redundant but is not removed (out of scope per Surgical Changes).
   - **Integration-test fallout** — `tests/integration/api/orders.test.ts` lines 72–93 assert `error: 'cart_empty'` against `selectedItemIds: []` (two `it` blocks). With `.min(1)` they will fail at the schema layer with `invalid_form` instead of reaching the transaction. Per Surgical Changes those test bodies must be updated minimally (change the expected `error` string to `'invalid_form'` or assert `res.status === 400` only). Document each touched line in the final report.

C. `schema rejects non-positive integers in selectedItemIds`
   - Three sub-assertions: `[0]` → false, `[-1]` → false, `[1.5]` → false.
   - All three should pass against the existing schema (`z.number().int().positive()`); no production change expected.

### E2E (Playwright) — `tests/e2e/cart-select.spec.ts`

D. `places order with only the selected items`
   1. `test.beforeEach`: `await resetDb()` (mirrors happy-path).
   2. Register fresh user — `email = e2e-cs-${Date.now()}@example.test`, name `Selector`, password `Passw0rd!` (copy happy-path lines 26–32 verbatim, just rename).
   3. After redirect to `/`, `await page.waitForURL('**/')`.
   4. `userId = await getUserIdByEmail(email)`.
   5. Seed cart directly: `insertCartItemDirect(userId, 1, 1)` and `insertCartItemDirect(userId, 2, 1)`. Faster + deterministic per CONTEXT.
   6. `page.goto('/')` so the `useCart` query fires and the drawer's row list is populated. **Load-bearing**: without this hydration the drawer opens with zero rows because the seed bypassed the `/api/cart` mutation. Capture `stock1Before = await getProductStock(1)`, `stock2Before = await getProductStock(2)`.
   7. Click `getByRole('button', { name: 'Open cart' })` to open drawer.
   8. Wait for both rows visible (`getByLabel('Select Test Product One')` and `Select Test Product Two`).
   9. Uncheck product 2 row: `page.getByLabel('Select Test Product Two').uncheck()`.
   10. Click `page.getByRole('button', { name: 'Checkout' })` — confirmed against `app/_components/CartDrawer.tsx`: it's a `<Button onClick={router.push('/checkout')}>`, not a link. The button is unique while the drawer Sheet is open.
   11. On `/checkout`, fill shipping: name `Selector`, address `2 Pick Lane`, city `Filterville`, zip `54321`.
   12. Click `Place order`. `page.waitForURL(/\/checkout\/success\/\d+/, { timeout: 30_000 })`.
   13. `orderId = Number(page.url().match(/\/success\/(\d+)/)[1])`.
   14. `res = await page.request.get(\`/api/orders/${orderId}\`)`. `body = await res.json()`.
   15. Assertions:
       - `expect(res.ok()).toBe(true)`.
       - `expect(body.items).toHaveLength(1)`.
       - `expect(body.items[0].product_id).toBe(1)` (product 1 = Test Product One = the *checked* row).
       - `expect(body.order.total_cents).toBe(1000)` (1 × $10).
   16. Optional sanity (still side-effect-only): `expect(await countOrders()).toBe(1)`, `expect(await getProductStock(1)).toBe(stock1Before - 1)`, `expect(await getProductStock(2)).toBe(stock2Before)` — confirms one order written, only the checked row's stock decremented.

## Implementation order

1. Write `tests/unit/cart-select.test.ts`.
2. `bun vitest run tests/unit/cart-select.test.ts` → expect A & C green, B likely red (production accepts empty array).
3. If B red: apply minimal production change to `lib/schemas/checkout.ts`:
   - `selectedItemIds: z.array(z.number().int().positive()).min(1)` — single token added.
   - Update `tests/integration/api/orders.test.ts` lines 72–93: change expected `error` from `'cart_empty'` to `'invalid_form'` in the two empty-selectedItemIds blocks (smallest possible).
   - Re-run vitest **full suite** (`bun vitest run`) — both new file and existing schemas + integration tests must be green.
4. Write `tests/e2e/cart-select.spec.ts`.
5. Verify drawer Checkout selector exists at the imagined node by reading the drawer source after step 4 (covered up-front above; impl reconfirms).
6. `bun playwright test cart-select`.
7. Apply decision rule (max 3 iters per file).

## Verification checklist

- [ ] `bun vitest run` all green (no regressions in other unit files).
- [ ] `bun playwright test cart-select` green.
- [ ] Net new files: exactly two (the two listed). No new fixtures/helpers.
- [ ] No production change beyond optional `.min(1)` (and only if test B is red after correct authoring).
- [ ] No DOM/jsdom dependency in unit file.

## Out of scope

- No regression / refactor of existing tests.
- No new shared fixture helpers.
- No assertions on success-page text or toast wording.
- No changes to `useCartSelection` itself.

## Review Trail

### Metis Plan Consultant
- [x] Test A: inline reduce rationale documented (no React/Next import).
- [x] Test A: `as CartItemView` cast strategy noted.
- [x] Test B: explicit `ok` shipping fixture defined.
- [x] Test B: contract delta of `.min(1)` documented (route-layer `nothing_selected` mapping becomes redundant; UI path verified unaffected).
- [x] E2E step 6: `page.goto('/')` rehydration flagged load-bearing.
- [x] E2E step 10: drawer Checkout selector resolved to `getByRole('button', { name: 'Checkout' })`.
- [x] E2E step 16: added `countOrders()` for parity with happy-path workshop convention.

### Momus Plan Reviewer
- [x] All file paths, schema names, type fields, fixture signatures verified.
- [x] All four e2e selectors verified against `app/_components/CartDrawer.tsx`.
- [x] Drawer Checkout reachability after uncheck verified (selection defaults to all-selected; product 1 stays checked → button enabled).
- [x] Plan §3 contingency now includes integration-test fallout (`tests/integration/api/orders.test.ts:72-93` will need `'cart_empty'` → `'invalid_form'`) and full-suite re-run.
