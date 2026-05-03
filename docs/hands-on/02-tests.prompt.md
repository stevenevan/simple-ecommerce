## INTENT

Add Vitest unit assertions and one Playwright e2e spec covering per-item cart selection.

## CONTEXT

- The cart-select feature was implemented in a previous Claude Code session — you are reading the diff fresh. Run `git diff main -- app lib` and read every changed file before writing tests.
- Test runners already wired:
  - Vitest: `npm test`
  - Playwright: `npm run test:e2e`
- Existing patterns to imitate verbatim (read both before writing):
  - `tests/unit/schemas.test.ts` — zod-schema unit-test shape.
  - `tests/e2e/happy-path.spec.ts` — Playwright spec shape. Note: that file **registers** a fresh user with a `Date.now()` email rather than logging an existing one in. Copy that auth setup. Do not author a new fixture.
  - `tests/fixtures/db.ts` exposes `resetDb`, `insertCartItemDirect`, `getProductStock`, `getUserIdByEmail`. Call `resetDb()` in `test.beforeEach` (matches happy-path) and use `insertCartItemDirect` to seed the cart instead of clicking "Add to cart" twice through the UI — faster and more deterministic.
- Test for _behavior_, not exact strings — Article 02's "assert the contract" rule. The drawer text and success-page wording are allowed to drift; the order's persisted `items` (the `OrderItemSnapshot[]` returned by `GET /api/orders/:id`) is not.

## CONSTRAINTS

- Exactly one new unit file: `tests/unit/cart-select.test.ts`.
- Exactly one new e2e spec: `tests/e2e/cart-select.spec.ts`.
- No new helpers, no new fixtures, no shared test utilities.
- Vitest assertions must be deterministic — no LLM-as-judge, no snapshot of free text.
- Playwright must assert on **DB / API side-effects** for the placed order (i.e. assert against the JSON body of `GET /api/orders/:id`), not on success-page text or toast wording.
- Test bugs (wrong assertion, wrong setup, flaky selector) → fix the test. Real production bugs surfaced by a correct test → fix the production code with the **smallest** change that makes the test green; do not refactor or rename. Document every production touch in the final report. Decision rule below in FORMAT.

## ACCEPTANCE

Three Vitest assertions, named exactly:

1. `subtotal recomputes when one row is excluded` — given two `CartItemView` rows and a selection set excluding one of them, the computed subtotal equals the sum of the _included_ `line_total_cents` only. If the feature exposes a pure helper (e.g. `selectedSubtotalCents(items, selected)`), import and call it. If the computation only lives inside a React component, **inline a pure mirror of the reducer in this test file** (3-line `reduce`) and assert against that — do not pull in jsdom or `@testing-library/react`. Article 02 unit-test rule: deterministic, no DOM.
2. `schema rejects empty selectedItemIds` — calling `safeParse` on the order schema (whichever name the feature chose: `placeOrderSchema`, an extended `checkoutShippingSchema`, etc.) with `selectedItemIds: []` returns `success: false`. Read the diff in `lib/schemas/checkout.ts` to find the exported name.
3. `schema rejects non-positive integers in selectedItemIds` — calling `safeParse` with `selectedItemIds: [0]` and again with `selectedItemIds: [-1]` returns `success: false`. Add `selectedItemIds: [1.5]` as a third sub-case to pin the integer constraint.

One Playwright spec:

4. `places order with only the selected items` — register a fresh user (reuse happy-path auth setup) → seed cart with two distinct products → open the cart drawer → uncheck one row → click Checkout → fill the shipping form → place the order → capture the order id from the success URL (`/checkout/success/:id`) → `page.request.get('/api/orders/:id')` (the page's request context carries the session cookie automatically) → response body shape is `{ order: OrderRow, items: OrderItemSnapshot[] }`. Assert `body.items.length === 1`; assert `body.items[0].product_id` equals the _checked_ product's id; assert `body.order.total_cents` equals the checked product's `price_cents × quantity`. Use the seed helpers in `tests/fixtures/db.ts` (`getProductStock`, `getUserIdByEmail`) where they help; do not author new fixtures.

## FORMAT

- Run `/plan-with-review`. When it asks for middle reviewers, answer **d** (skip).
- After the plan is approved by metis + momus, write both test files and run them.
- **Failure decision rule** (max 3 iterations per file):
  1. Test fails → re-read your assertion against the ACCEPTANCE block above.
  2. Assertion does **not** match the acceptance text → test bug. Fix the test, re-run.
  3. Assertion matches acceptance + production diff under `app`/`lib` does **not** satisfy the acceptance behavior → real production bug. Patch production with the smallest change that makes the test green (no refactor, no rename, no adjacent cleanup). Re-run.
  4. Three iterations and still red without a clear class above → STOP and report. Don't loop.
- Stop after `npm test` is green and `npx playwright test cart-select` is green, **or** after STOP per (4).
- Final report format: per-file green/red + list every production file you touched and the one-line reason (per Article 02 / Surgical Changes — every prod edit traces to a failing assertion).
