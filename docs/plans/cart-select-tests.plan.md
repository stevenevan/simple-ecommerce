# cart-select tests plan

Source: `docs/hands-on/02-tests.prompt.md`. Cover the per-item cart selection feature (already merged on `feat/cart-select`) with the smallest-possible test surface: 1 Vitest file (3 assertions) + 1 Playwright spec (1 scenario).

## Context (verified, not assumed)

- Production diff is on `feat/cart-select`. Already inspected via `git diff main -- app lib`. Highlights:
  - `lib/schemas/checkout.ts` exports `placeOrderSchema = checkoutShippingSchema.extend({ selectedItemIds: z.array(z.int().positive()).min(1) })`.
  - `app/_components/CartSelectionContext.tsx` is a client-only React context tracking *excluded* cart_item ids (inverse selection).
  - `app/_components/CartDrawer.tsx` renders one `<Checkbox aria-label="Include ${it.name} in order">` per row + computes `selectedSubtotal` inline via `selectedItems.reduce((s, it) => s + it.line_total_cents, 0)`.
  - `app/checkout/page.tsx` mirrors that same reducer inline; passes `selectedItemIds = items.filter(!isExcluded).map(id)` to the create-order mutation.
  - `app/api/orders/route.ts` POST: pre-checks `selectedItemIds.length === 0` → returns `{ error: 'nothing_selected' }` 400 (more specific than schema's invalid_form). Then `placeOrderSchema.safeParse(body)`.
  - `lib/db/queries.ts:createOrderForUser` filters cart rows by `selectedSet.has(it.id)` (cart_items.id, NOT product_id) and only deletes the *selected* cart_items at the end.
  - `lib/db/queries.ts:getOrderForUser` (line 328) returns `{ order: OrderRow, items: OrderItemSnapshot[] } | null`. `OrderItemSnapshot` shape from `lib/types.ts:44` is `{ id, product_id, name_snapshot, price_cents_snapshot, quantity }`.

- Seed (`tests/fixtures/seed.ts`):
  - p1 (id 1, slug `p1`, name `Test Product One`, price 1000, stock 5).
  - p2 (id 2, slug `p2`, name `Test Product Two`, price 500, stock 1).

- Reference patterns to imitate verbatim:
  - `tests/unit/schemas.test.ts` — minimal `describe`/`it`, `safeParse(...).success` assertions.
  - `tests/e2e/happy-path.spec.ts` — `resetDb` in beforeEach; register-fresh-user auth (`e2e-${Date.now()}@example.test`, password `Passw0rd!`); shipping form labels (`Name`, `Address`, `City`, `Zip`); `page.waitForURL(/\/checkout\/success\/\d+/, { timeout: 30_000 })`; `page.request.get(...)` for API assertions.
  - `tests/fixtures/db.ts` — `resetDb`, `insertCartItemDirect(userId, productId, quantity)`, `getUserIdByEmail`. **No new fixtures.**

## File 1 — `tests/unit/cart-select.test.ts` (NEW)

Three assertions, named exactly as the acceptance block:

### A1 — `subtotal recomputes when one row is excluded`

The reducer lives inline in `CartDrawer.tsx` and `app/checkout/page.tsx`. No exported helper. Per acceptance: **inline a 3-line pure mirror** in this file. No DOM, no jsdom, no `@testing-library/react`.

```ts
const subtotalOf = (items: Pick<CartItemView, 'id' | 'line_total_cents'>[], excluded: Set<number>) =>
  items.filter((it) => !excluded.has(it.id)).reduce((s, it) => s + it.line_total_cents, 0)
```

Build two rows (`{ id: 1, line_total_cents: 1000 }`, `{ id: 2, line_total_cents: 500 }`), exclude id 2, assert `subtotalOf(rows, new Set([2])) === 1000`. Use `Pick<CartItemView, ...>` so we don't have to fabricate the full type.

### A2 — `schema rejects empty selectedItemIds`

```ts
const validShipping = { name: 'Jane', address: '1 St', city: 'NYC', zip: '12345' }
expect(placeOrderSchema.safeParse({ ...validShipping, selectedItemIds: [] }).success).toBe(false)
```

### A3 — `schema rejects non-positive integers in selectedItemIds`

Three sub-cases, all `success: false`:
- `selectedItemIds: [0]`
- `selectedItemIds: [-1]`
- `selectedItemIds: [1.5]`

Single `it()` with three `expect(...).toBe(false)` lines (matches the `schemas.test.ts` style — multi-case in one `it` is fine when the constraint is the same).

### Imports

```ts
import { describe, expect, it } from 'vitest'
import { placeOrderSchema } from '@/lib/schemas/checkout'
import type { CartItemView } from '@/lib/types'
```

## File 2 — `tests/e2e/cart-select.spec.ts` (NEW)

One spec: `places order with only the selected items`.

### Setup

```ts
test.beforeEach(async () => { await resetDb() })
```

### Step-by-step

1. `page.goto('/register')`. Register `e2e-${Date.now()}@example.test`, name `E2E Buyer`, password `Passw0rd!`. **Await** `page.waitForURL('**/')` before any DB call — the user row does not exist until the redirect resolves. (Verbatim from `happy-path.spec.ts:26-32`.)
2. `const userId = await getUserIdByEmail(email)` → seed cart with `insertCartItemDirect(userId, 1, 1)` then `insertCartItemDirect(userId, 2, 1)`. Faster + deterministic than two UI add-to-cart clicks.
3. Open the cart drawer via `page.getByRole('button', { name: 'Open cart' }).click()`. (Confirmed `aria-label="Open cart"` at `CartDrawer.tsx:68`.) **Required guard before unchecking**: `await expect(page.getByRole('checkbox', { name: 'Include Test Product Two in order' })).toBeVisible()` — DB-seeded items only render after the cart query resolves on drawer open; without this guard the click races the React Query response.
4. Uncheck p2's row: `const cb = page.getByRole('checkbox', { name: 'Include Test Product Two in order' }); await cb.click(); expect(await cb.isChecked()).toBe(false)`. Assertion guards against a flaky click. Use exact-string locators (no regex) — the aria-label is constant.
5. Click the drawer's Checkout control: `page.getByRole('button', { name: 'Checkout' }).click()`. Confirmed `<Button>` (not Link) at `CartDrawer.tsx:177-185`.
6. On `/checkout`, fill shipping form: `Name=E2E Buyer`, `Address=1 E2E Lane`, `City=Testville`, `Zip=12345` (matches happy-path).
7. Click `Place order`. `await page.waitForURL(/\/checkout\/success\/\d+/, { timeout: 30_000 })`.
8. Capture order id: `const orderId = Number(new URL(page.url()).pathname.match(/\/checkout\/success\/(\d+)/)![1])`.
9. `const res = await page.request.get(\`/api/orders/${orderId}\`)`. `expect(res.ok()).toBe(true)`. `const body = await res.json()`.
10. Assert:
    - `expect(body.items).toHaveLength(1)`
    - `expect(body.items[0].product_id).toBe(1)` (p1 — the *checked* one)
    - `expect(body.order.total_cents).toBe(1000)` (p1 price 1000 × qty 1)

### Imports

```ts
import { test, expect } from '@playwright/test'
import { resetDb, getUserIdByEmail, insertCartItemDirect } from '../fixtures/db'
```

## Production-touch policy

Per the prompt's failure decision rule (max 3 iterations per file):

1. Test red → re-read against acceptance text in the prompt.
2. Assertion mismatches acceptance → test bug. Fix test, re-run.
3. Assertion matches + production diff doesn't satisfy acceptance → real prod bug. Smallest patch under `app`/`lib`. No refactor, no rename, no adjacent cleanup. Document every touch in the final report.
4. Three iterations red without a clear class → STOP, report.

**Anticipated risk areas** (worth pre-flagging so we don't loop):

- Drawer trigger accessible name might not be obvious — pre-verify in CartDrawer.tsx before writing the locator. (Logged below in "Open Questions / Pre-impl verification".)
- The drawer's "Checkout" control might be a `Link` not `Button` — same pre-verify.
- The pruning effect on `useCartSelection` runs after cart data updates. Since we seed via DB (bypassing the cart query), the cart query will fetch fresh on drawer open. Should be fine, but if the test races, add `await expect(page.getByText('Test Product Two')).toBeVisible()` before unchecking.

## Verification commands

```bash
npm test -- cart-select          # vitest, single file
npx playwright test cart-select  # playwright, single spec
```

Both must be green to declare done.

## Pre-impl verification (resolved)

- Cart drawer trigger: `aria-label="Open cart"` at `CartDrawer.tsx:68`.
- Drawer Checkout control: `<Button>` with text `Checkout` at `CartDrawer.tsx:177-185`.
- Checkbox aria-label exact: `Include ${it.name} in order` at `CartDrawer.tsx:100`.

## Review Trail

### Metis Plan Consultant
- [x] A — Step 5 corrected: `getByRole('button', { name: 'Checkout' })` (was `link`).
- [x] B — Step 4 assertion fixed: `expect(await cb.isChecked()).toBe(false)` (was Promise-vs-false comparison).
- [x] C — Step 1/2 ordering pinned: `await page.waitForURL('**/')` before `getUserIdByEmail`.
- [x] D — Drawer visibility guard promoted from optional to required (step 3).
- [x] E — Open-cart locator pinned to exact string `'Open cart'` (no regex).
- [x] Resolved open questions section now lists confirmed values, not pending checks.

### Middle Reviewers
- [d] Skipped per prompt FORMAT section

### Momus Plan Reviewer
- [x] All file paths, imports, locators verified against codebase.
- [x] Vitest assertion names + e2e spec name exact match to ACCEPTANCE.
- [x] No new fixtures/helpers/utilities. API-only assertions, no text/toast.
- Verdict: **OKAY** — plan is executable as written.

### Execution outcome
- Vitest: 3/3 green on first run.
- Playwright: red on first run → test bug (cart query had already fetched empty before DB seed). Fix: `await page.reload()` after seeding so `useCart` remounts and refetches. No production touch. Green on second run.
