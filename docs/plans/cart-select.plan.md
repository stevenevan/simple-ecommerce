# Cart-select feature plan

Source spec: `docs/hands-on/01-feature.prompt.md`. This plan refines that into concrete file edits and pins the design decisions the spec leaves open.

## 1. Goals

Per-item cart selection so only checked rows place into the order.
- Selection UI lives in `CartDrawer` only.
- `/checkout` reads selection (filters summary + disables button) but does not own checkboxes.
- Server enforces selection: only selected `cart_items` rows are snapshotted into the order; unselected rows survive in `cart_items`.
- `useCart` wire shape unchanged; selection is purely client-side.

## 2. Decisions (with justification)

### D1. Schema strategy: sibling `placeOrderSchema`, not extension of `checkoutShippingSchema`

The form in `app/checkout/page.tsx` uses `checkoutShippingSchema` for `validators.onChange` over name/address/city/zip. Selection is owned by a different surface (drawer / selection context) and isn't a form field. Mixing them blurs concerns and would force the form to register a phantom `selectedItemIds` field. New file export:

```ts
export const placeOrderSchema = checkoutShippingSchema.extend({
  selectedItemIds: z.array(z.int().positive()).min(1),
})
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>
```

`z.int().positive()` rejects `0`, negatives, and floats (`1.5`) in one rule — covers all three sub-cases in the test prompt. `.min(1)` rejects `[]`.

**API verified against zod v4 docs (context7):** `z.int()` is a top-level shortcut introduced in v4 that returns an integer schema with built-in `[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]` bounds; `.positive()` chains directly on it (refinement chaining was fixed in v4). If `z.int()` ever proves unavailable in this exact `zod@4.4.1` build, the equivalent fallback is `z.number().int().positive()` — same observable behavior.

### D2. ID space: `selectedItemIds` are `cart_items.id` values, not `product_id`

The drawer selects rows. `CartItemView.id` is the row identity. Server filter: `items.filter(it => selectedSet.has(it.id))`.

### D3. Error code `nothing_selected`: pre-parse check in route handler

The schema rejects `[]` (per unit-test prompt #2). But schema rejection routes through the existing `invalid_form` envelope, which would mask the more specific code the test prompt #5 requires. Resolution: in `POST /api/orders`, peek at the parsed-but-not-yet-validated body **before** `safeParse`:

```ts
const body = await req.json().catch(() => null)
if (Array.isArray(body?.selectedItemIds) && body.selectedItemIds.length === 0) {
  return Response.json({ error: 'nothing_selected' }, { status: 400, headers: NO_STORE })
}
const parsed = placeOrderSchema.safeParse(body)
```

This gives:
- Unit test on schema with `[]` → `success: false` (schema's `.min(1)`) ✅
- API test with `selectedItemIds: []` → `400 { error: 'nothing_selected' }` ✅
- Other shape errors → `400 invalid_form` (unchanged) ✅

### D4. Selection state: tiny React context in `app/_components/CartSelectionContext.tsx`

Spec says "pick the simpler option in the plan" between query-cache slice and small context. Context wins:
- TanStack cache is for server data; selection is purely UI ephemeral.
- Provider is a single file, no extra dependencies.
- Lives inside `<QueryClientProvider>` in `app/providers.tsx` so consumers can call `useCart()` and `useCartSelection()` together.

### D5. Selection storage: `excludedIds: Set<number>`, not `selectedIds`

Default is all-selected; new items default to selected; removed items drop out. Tracking what the user has explicitly **un**checked (excluded) makes all three behaviors free:
- New item → not in excluded → selected by default (no reconciliation needed for adds).
- Removed item → its id stays in excluded but contributes nothing because consumers always intersect with current `items`. Pruned via a `useEffect` in the drawer (the only mutator) keyed on `items` to keep the set bounded.
- `selectedItemIds = items.filter(i => !excluded.has(i.id)).map(i => i.id)`.

Hook surface:

```ts
useCartSelection(): {
  isExcluded: (id: number) => boolean
  toggle: (id: number) => void
  prune: (currentItemIds: number[]) => void  // drop excluded entries no longer in cart
}
```

### D6. `components/ui/checkbox.tsx` does NOT currently exist; add it

The spec claims it ships at that path; it doesn't (verified — `ls components/ui/` shows no `checkbox.tsx`). Spec's stated API matches Base UI's Checkbox primitive (`@base-ui/react/checkbox`). Add the file as a thin Base UI wrapper, matching the wrapper style of `select.tsx` / `sheet.tsx`. No new dependency (`@base-ui/react` is already in `package.json`).

### D7. Server filter inside transaction

In `createOrderForUser`, after loading cart items, filter to selected before stock decrement / snapshot / delete. The `DELETE FROM cart_items WHERE cart_id = ?` becomes `WHERE cart_id = ? AND id IN (...)` so unselected rows survive. If the post-filter list is empty → `throw new Error('cart_empty')` (existing 400 path; no new error code needed in the query layer).

## 3. File changes

### NEW `components/ui/checkbox.tsx`

Base UI wrapper. **API verified against `@base-ui/react` checkbox docs (context7):**
- `Checkbox.Root` props: `checked: boolean`, `onCheckedChange: (checked: boolean, eventDetails) => void`, `indeterminate: boolean`, `disabled`, etc.
- `Checkbox.Indicator` does NOT accept a function-as-child. State-driven rendering goes through `data-checked` / `data-unchecked` / `data-indeterminate` attributes (CSS-toggled), or via the `className` callback `(state) => string`. Default behavior: indicator only mounts when `checked` (or `indeterminate`); use `keepMounted` to opt out.

Our use case is binary checked/unchecked — no indeterminate. Single-icon Indicator, default unmount-when-unchecked is exactly right.

```tsx
'use client'
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs outline-none transition-shadow focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[checked]:text-primary-foreground data-[checked]:border-primary',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
```

Caller surface unchanged: `<Checkbox checked={...} onCheckedChange={(checked) => ...} aria-label="..." />`. Note `onCheckedChange` receives `(checked: boolean, eventDetails)`; callers must accept the `checked` argument (TS will accept a 0-arg handler at runtime but the existing repo lints unused props strictly — destructure or rename to `_checked` if discarding).

### NEW `app/_components/CartSelectionContext.tsx`

```tsx
'use client'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

type Ctx = {
  isExcluded: (id: number) => boolean
  toggle: (id: number) => void
  prune: (currentItemIds: number[]) => void
}

const CartSelectionContext = createContext<Ctx | null>(null)

export function CartSelectionProvider({ children }: { children: React.ReactNode }) {
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(() => new Set())

  const isExcluded = useCallback((id: number) => excluded.has(id), [excluded])

  const toggle = useCallback((id: number) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const prune = useCallback((currentItemIds: number[]) => {
    setExcluded((prev) => {
      const present = new Set(currentItemIds)
      let changed = false
      const next = new Set<number>()
      for (const id of prev) {
        if (present.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [])

  const value = useMemo(() => ({ isExcluded, toggle, prune }), [isExcluded, toggle, prune])
  return <CartSelectionContext.Provider value={value}>{children}</CartSelectionContext.Provider>
}

export function useCartSelection() {
  const ctx = useContext(CartSelectionContext)
  if (!ctx) throw new Error('useCartSelection must be used inside <CartSelectionProvider>')
  return ctx
}
```

### EDIT `app/providers.tsx`

Wrap `{children}` in `<CartSelectionProvider>` inside the existing `<QueryClientProvider>`.

### EDIT `lib/schemas/checkout.ts`

Add `placeOrderSchema` + `PlaceOrderInput` per D1. Keep existing `checkoutShippingSchema` untouched (the form still uses it).

### EDIT `lib/db/queries.ts`

`createOrderForUser` signature change:
```ts
export function createOrderForUser(
  userId: number,
  input: PlaceOrderInput,  // was: CheckoutShippingInput
): Promise<{ id: number }>
```

Inside the transaction:
1. Load cart items (existing JOIN).
2. **Filter** to `items.filter(it => selectedSet.has(it.id))` where `selectedSet = new Set(input.selectedItemIds)`.
3. If filtered length === 0 → `throw new Error('cart_empty')`.
4. Stock decrement, total compute, order insert, order_items insert — all over **filtered** items only.
5. `DELETE FROM cart_items WHERE cart_id = ? AND id IN (...selectedIds)` instead of clearing the whole cart.

Import: add `import type { PlaceOrderInput } from '@/lib/schemas/checkout'`. Drop the `CheckoutShippingInput` import if no longer used.

### EDIT `app/api/orders/route.ts`

**Body must be parsed exactly once.** The current code does `await req.json()` inline inside `safeParse(await req.json().catch(...))`. The `nothing_selected` pre-check needs the body too, but `req.json()` consumes the request stream — calling it twice would yield empty/null on the second call and produce spurious `invalid_form` on every valid request. Fix shape:

```ts
const body = await req.json().catch(() => null)

// nothing_selected pre-check (more specific than invalid_form)
if (body && typeof body === 'object' && Array.isArray((body as { selectedItemIds?: unknown }).selectedItemIds) &&
    (body as { selectedItemIds: unknown[] }).selectedItemIds.length === 0) {
  return Response.json({ error: 'nothing_selected' }, { status: 400, headers: NO_STORE })
}

const parsed = placeOrderSchema.safeParse(body)
if (!parsed.success) {
  return Response.json(
    { error: 'invalid_form', fields: z.flattenError(parsed.error).fieldErrors },
    { status: 400, headers: NO_STORE },
  )
}
```

Then pass `parsed.data` to `createOrderForUser` (now includes `selectedItemIds`). Existing `cart_empty` / `insufficient_stock` / `payload_too_large` / `unauthorized` paths unchanged.

### EDIT `app/checkout/_hooks/useCreateOrder.ts`

Change `mutationFn`'s input type from `CheckoutShippingInput` → `PlaceOrderInput`. Update import.

### EDIT `app/_components/CartDrawer.tsx`

- Import `Checkbox` from `@/components/ui/checkbox` and `useCartSelection` from `@/app/_components/CartSelectionContext`.
- Add `useEffect(() => prune(items.map(i => i.id)), [items, prune])` to drop stale exclusions.
- Per row: render `<Checkbox checked={!isExcluded(it.id)} onCheckedChange={(_checked) => toggle(it.id)} aria-label={\`Include ${it.name}\`} />` to the left of the thumbnail. (Handler must accept the `checked` arg per Base UI's `(checked, eventDetails) => void` signature; we discard it because `toggle` flips internally.)
- Compute `selectedItems = items.filter(i => !isExcluded(i.id))` and `selectedSubtotal = selectedItems.reduce(... line_total_cents)`.
- Replace the footer `Subtotal` value with `formatCurrency(selectedSubtotal)`.
- Disable Checkout button when `selectedItems.length === 0` (in addition to existing `items.length === 0`).

### EDIT `app/checkout/page.tsx`

- Import `useCartSelection`.
- After existing `items` / `subtotalCents` derivation, compute `selectedItems = items.filter(i => !isExcluded(i.id))` and `selectedSubtotal = selectedItems.reduce(...)`.
- Render the order-summary list from `selectedItems` (not `items`). Show `formatCurrency(selectedSubtotal)`.
- If `items.length > 0 && selectedItems.length === 0` → render the empty-selection state in the order-summary card: copy text "No items selected — open the cart to choose what to check out".
- Disable submit when `selectedItems.length === 0` (extend existing `disabled` expression on the Place-order Button).
- Form `onSubmit` payload: `mutateAsync({ ...value, selectedItemIds: selectedItems.map(i => i.id) })`.
- Update `useForm`'s `defaultValues satisfies CheckoutShippingInput` annotation — leave the form's owned shape as `CheckoutShippingInput`; merge with selection at submit time. (Selection isn't a form field, so the form's validators stay against `checkoutShippingSchema`.)

### EDIT `tests/integration/db/queries.test.ts`

Every `createOrderForUser(u.id, SHIPPING)` call site needs `selectedItemIds`. The function now accepts `PlaceOrderInput`. Inline-extending `SHIPPING` per call: `createOrderForUser(u.id, { ...SHIPPING, selectedItemIds: [...] })` — minimum churn, no new helper.

**This IS a small rewrite, not just adding a field.** Most existing tests call `await seedCartItem(cart.id, p.id, qty)` and discard the return value. To pass the seeded cart_item ids in `selectedItemIds`, those calls must capture the return: `const item1 = await seedCartItem(cart.id, p1.id, 2)`. (Verified via context7 — `seedCartItem` returns `Promise<{ id: number }>` per `tests/setup/db.ts`.)

For each test case:

| Test                                                         | What changes                                                                          |
|--------------------------------------------------------------|---------------------------------------------------------------------------------------|
| happy path (2 items)                                         | Capture `item1`, `item2` from `seedCartItem`. Pass `selectedItemIds: [item1.id, item2.id]`. |
| empty cart throws cart_empty                                 | No items seeded; pass `selectedItemIds: [1]` (any non-empty — fails the empty-items check inside the txn before the selection filter ever runs). |
| no cart at all throws cart_empty                             | Same: `selectedItemIds: [1]`.                                                         |
| insufficient stock on second item rolls back first decrement | Capture both `seedCartItem` returns; pass `[item1.id, item2.id]`.                     |
| total overflow                                               | Capture the single `seedCartItem` return; pass `[item.id]`.                           |
| concurrent stock race                                        | Capture each cart's seeded item; pass `[itemFor(c1).id]` and `[itemFor(c2).id]` per call. |

After these edits, all existing assertions (totals, stock, snapshot persistence, cart cleared) still hold:
- "happy path" `remaining === []` still passes because both seeded items are selected → both deleted by the new `WHERE cart_id = ? AND id IN (...)`.
- "insufficient stock rolls back" `cart_items` count of 2 still holds because the entire transaction aborts before any DELETE runs.
- "concurrent stock race" still resolves to one fulfilled / one `insufficient_stock` rejection — selection filter is per-call and each cart only has one item.

**Acceptance criterion 3 ("cart_items still contains the unchecked row") is NOT covered by these existing tests** — they all select all seeded items. That criterion is verified by the Playwright spec authored in prompt 02 (out of scope for this turn). Acceptable per spec FORMAT.

## 4. Implementation order

1. `lib/schemas/checkout.ts` — add `placeOrderSchema` + type. (No consumers yet.)
2. `lib/db/queries.ts` — update `createOrderForUser` signature + filter logic.
3. `tests/integration/db/queries.test.ts` — update call sites. Run `npm test` — must be green before touching any UI.
4. `app/api/orders/route.ts` — wire `placeOrderSchema` + `nothing_selected` pre-check.
5. `app/checkout/_hooks/useCreateOrder.ts` — input type swap.
6. `components/ui/checkbox.tsx` — new primitive.
7. `app/_components/CartSelectionContext.tsx` — new context.
8. `app/providers.tsx` — mount provider.
9. `app/_components/CartDrawer.tsx` — checkbox per row, selected subtotal, disable when zero selected.
10. `app/checkout/page.tsx` — filter summary, empty-selection state, merge selection at submit.
11. `npx tsc --noEmit` clean.
12. `npm test` green.

## 5. Verification

- `npx tsc --noEmit` — no type errors.
- `npm test` — all Vitest suites green, including the updated integration tests.
- Manual smoke (out of scope per spec FORMAT — no Playwright in this turn): not required for stop condition.

## 6. Out of scope (spec confirms)

- Persisting selection across sessions.
- New tests (separate prompt 02).
- Playwright run.
- Multi-cart / partial-stock UI redesign.
- Payment integration.

## 7. Open questions

- None.

## Review Trail

### Metis Plan Consultant
- [~] **z.int() flagged as invalid zod v4 API** — verified against zod v4 docs (context7); `z.int()` IS a top-level shortcut in v4 with built-in safe-integer bounds. `.positive()` chains directly. Plan kept as-is; D1 now records the verification + fallback (`z.number().int().positive()` if the API ever moves).
- [x] **Base UI Indicator render-prop pattern is wrong** — confirmed via context7. `Checkbox.Indicator` doesn't accept a function child; state-driven rendering uses `data-checked`/`data-unchecked`/`data-indeterminate` attributes (or `className` callback). Snippet rewritten in §3 NEW `components/ui/checkbox.tsx` to a single-icon Indicator (no indeterminate state needed for our use case) that auto-unmounts when unchecked.
- [x] **`onCheckedChange` handler must accept `checked`** — fixed in §3 EDIT `CartDrawer.tsx` to `(_checked) => toggle(it.id)` with explanatory note.
- [x] **D3 double-`req.json()` parse bug** — §3 EDIT `app/api/orders/route.ts` rewritten to parse the body once into `body`, then use `body` in both the `nothing_selected` pre-check and the `placeOrderSchema.safeParse(body)` call. Explicit code shown.
- [x] **"No rewrite expected" for happy-path test was wrong** — §3 EDIT `tests/integration/db/queries.test.ts` now explicitly says this IS a small rewrite: existing `await seedCartItem(...)` calls discard the return value, but we now need to capture them as `item1`/`item2` to pass real cart_item ids into `selectedItemIds`. Verified `seedCartItem` returns `Promise<{ id: number }>`.
- [x] **Empty-cart `[1]` rationale clarified** — §3 EDIT now explains correctly: the items-empty check inside the txn fires BEFORE the selection filter, so any non-empty `selectedItemIds` value works.
- [x] **Acceptance #3 not covered by integration tests** — explicitly noted in §3 EDIT; verified by Playwright spec in prompt 02 (out of scope for this turn).

(Middle reviewers skipped per user direction.)

### Momus Plan Reviewer
- [x] All file paths in §3 verified against the working tree.
- [x] `kdb` (`lib/db/kysely.ts:66`), `cn` (`lib/utils.ts:4`), `tsconfig.json` `@/*` resolution confirmed.
- [x] `@base-ui/react@^1.4.1` confirmed in `package.json`; `@base-ui/react/checkbox` subpath matches the existing `sheet.tsx` import style.
- [x] `tests/integration/db/queries.test.ts` `describe('createOrderForUser')` contains exactly the six `it` blocks the plan's table addresses; no other `createOrderForUser(...)` call sites in the suite.
- [x] Implementation order (§4) has no dependency violations.
- [x] Route-handler double-`req.json()` rewrite is correct.
- [x] Acceptance #1, #2, #4, #5, #6 trace to concrete file changes; #3 explicitly deferred to Playwright in prompt 02 (per spec FORMAT).
- [x] Code snippets compile against the existing typing conventions (`CheckboxPrimitive.Root.Props`, etc.).
- [x] **No must-fix blockers; plan ready to execute.**
