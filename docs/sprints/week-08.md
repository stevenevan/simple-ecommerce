# Week 8 — Checkout & Orders

## Goals

Close the loop. Authenticated user with items in cart can:
1. Hit `/checkout`, fill in a shipping form built with TanStack Form + the `checkoutShippingSchema` zod schema (from `lib/schemas/checkout.ts`) + shadcn `Field` primitives, submit.
2. Server runs a single transaction that recomputes total from current prices, decrements stock with race protection, snapshots order lines, and clears the cart.
3. Land on `/checkout/success/[id]` showing the order summary.
4. Visit `/orders` to see history; each row links back to `/checkout/success/[id]`.

End of sprint = working demo. Hand-off README updated.

## Dependencies (from prior weeks) — ALL HARD PREREQS

- Wk 4.5: `lib/schemas/auth.ts`, `lib/schemas/checkout.ts`.
- Wk 6: `ensureSession`.
- Wk 7: `getOrCreateCart`, `listCartItems`, cart UI feeding into `/checkout`.

## Pre-flight reading

- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`

## In-scope tasks

1. **Schema is `checkoutShippingSchema` in `lib/schemas/checkout.ts`** (created Wk 4.5). No additions to `lib/validators.ts` (which never gets created). Same trim/regex/required rules as the original brief — see Wk 4.5 §5.3.
2. **Add order helpers to `lib/db/queries.ts`:**
   - `createOrderForUser(userId, shipping)` — does the work in §3 below; returns `{ id }` or throws a tagged error (`'cart_empty' | 'insufficient_stock'`).
   - `listOrdersForUser(userId)` — single query with `LEFT JOIN order_items` + `GROUP BY orders.id` returning `(id, total_cents, created_at, item_count)`. **No per-row lookup.**
   - `getOrderForUser(userId, orderId)` — joins `order_items`; returns `{ order, items: OrderItemSnapshot[] } | null`.
3. **`createOrderForUser` (transaction body):**
   ```ts
   db.transaction(() => {
     const cart = getOrCreateCart(userId)
     const items = listCartItems(cart.id)
     if (items.length === 0) throw new Error('cart_empty')

     // Re-fetch authoritative prices and decrement stock atomically per line.
     const decrement = db.prepare(
       'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?'
     )
     let totalCents = 0
     for (const it of items) {
       const r = decrement.run(it.quantity, it.product_id, it.quantity)
       if (r.changes === 0) throw new Error('insufficient_stock')
       const fresh = getProductById(it.product_id)!  // re-read to snapshot price
       totalCents += fresh.price_cents * it.quantity
     }

     const order = db.prepare(
       `INSERT INTO orders (user_id, total_cents, shipping_name, shipping_address,
                            shipping_city, shipping_zip)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
     ).get(userId, totalCents, shipping.name, shipping.address,
           shipping.city, shipping.zip) as { id: number }

     const insertItem = db.prepare(
       `INSERT INTO order_items
          (order_id, product_id, name_snapshot, price_cents_snapshot, quantity)
        VALUES (?, ?, ?, ?, ?)`
     )
     for (const it of items) {
       insertItem.run(order.id, it.product_id, it.name, it.price_cents, it.quantity)
     }

     db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id)
     return order.id
   })()
   ```
   `getProductById` is a tiny new helper (one-line `SELECT * FROM products WHERE id = ?`).
4. **Order route handlers** — every one declares `export const dynamic = 'force-dynamic'`. POST enforces a 10 KB body cap before parsing JSON.
   - `app/api/orders/route.ts`:
     - **GET**: `ensureSession` → `listOrdersForUser` → `200 { orders }`.
     - **POST**:
       ```ts
       import { z } from 'zod'
       import { checkoutShippingSchema } from '@/lib/schemas/checkout'

       const MAX_BODY_BYTES = 10_000

       export async function POST(req: NextRequest) {
         const user = await ensureSession()           // 401 if logged out
         const len = Number(req.headers.get('content-length') ?? 0)
         if (len > MAX_BODY_BYTES) return Response.json({ error: 'payload_too_large' }, { status: 413 })

         const parsed = checkoutShippingSchema.safeParse(await req.json().catch(() => null))
         if (!parsed.success) {
           return Response.json(
             { error: 'invalid_form', fields: z.flattenError(parsed.error).fieldErrors },
             { status: 400 },
           )
         }
         // pre-check cart empty → 400 { error: 'cart_empty' }
         // try { createOrderForUser(user.id, parsed.data) } catch errors:
         //   'cart_empty' → 400, 'insufficient_stock' → 409, else → 500
         // return { id }
       }
       ```
       `ensureSession()` runs *before* `safeParse` so unauthenticated callers can't even probe the schema.
   - `app/api/orders/[id]/route.ts` — **GET**: `await params`; `ensureSession`; `getOrderForUser(user.id, id)` → 404 if null; return order + items.
5. **`lib/hooks/useOrders.ts`:**
   - `useOrders` → `useQuery({ queryKey: ['orders'], queryFn: ..., enabled: !!me?.user, staleTime: 0 })`.
   - `useCreateOrder` → `useMutation`. `onSuccess` → invalidate `['orders']`, **invalidate `['cart']`** (cart is now empty), `toast.success('Order placed')`. `onError` → `toast.error(friendlyMap[err.message] ?? 'Something went wrong')`.
6. **Add shadcn primitive — ASK USER before running:**
   ```bash
   bunx shadcn@latest add textarea
   ```
   (`field` and `label` are already installed from Wk 4.5.)
7. **`app/checkout/page.tsx`** (`'use client'` — `useForm` is a client hook):
   - Reads `useCart()` and `useMe()`.
   - If logged out → redirect to `/login` via `useEffect`.
   - If cart empty → render a panel "Your cart is empty" with a CTA to `/`.
   - Render the cart line items as a read-only summary (image, name, qty × price, line total) plus subtotal — reuse same renderer pattern as the drawer.
   - Form built with TanStack Form + `checkoutShippingSchema` + shadcn `Field` primitives — same pattern as Wk 6 login/register pages:
     ```tsx
     const form = useForm({
       defaultValues: { name: '', address: '', city: '', zip: '' } satisfies CheckoutShippingInput,
       validators: { onChange: checkoutShippingSchema },
       onSubmit: async ({ value }) => {
         const { id } = await createOrder.mutateAsync(value)
         router.push(`/checkout/success/${id}`)
       },
     })
     ```
     `address` uses shadcn `<Textarea>` (multi-line); `name`, `city`, `zip` use `<Input>`. Each wraps in a `<Field data-invalid={isInvalid}>` with `<FieldLabel>` + `<FieldError errors={field.state.meta.errors}>`.
   - Submit button gated via `form.Subscribe`:
     ```tsx
     <form.Subscribe
       selector={(s) => [s.canSubmit, s.isSubmitting] as const}
       children={([canSubmit, isSubmitting]) => (
         <Button type="submit" disabled={!canSubmit || isSubmitting || cart.items.length === 0}>
           {isSubmitting ? 'Placing order…' : 'Place order'}
         </Button>
       )}
     />
     ```
     `cart.items.length === 0` is the cart-empty guard (derived from `useCart()` in component scope, not from form state).
8. **`app/checkout/success/[id]/page.tsx`** — server component, **canonical order-detail page**:
   ```tsx
   export const dynamic = 'force-dynamic'
   export default async function SuccessPage({
     params,
   }: { params: Promise<{ id: string }> }) {
     const { id } = await params
     const session = await getSession()
     if (!session.user) redirect('/login')
     const data = getOrderForUser(session.user.id, Number(id))
     if (!data) notFound()
     return <OrderSummary order={data.order} items={data.items} />
   }
   ```
   Renders shipping address, item list (using snapshot name + price — not current product price), total. CTA back to `/`.
9. **`app/orders/page.tsx`** (client):
   - `useOrders()`. Empty state if no orders.
   - List rendering date + total + item count.
   - **Each row links to `/checkout/success/[id]` — no separate `/orders/[id]` page exists.**
10. **Update `Header.tsx`** — when authed, add an "Orders" link between the cart icon and the user menu, pointing to `/orders`.
11. **Update README** with a hand-off block:
    - Demo creds: `demo@example.com` / `Demo1234!`.
    - Prereq: **Node 24** (`.nvmrc` provided; `nvm use` if available).
    - Run sequence:
      ```bash
      node --version          # v24.x.x
      bun install
      cp .env.example .env    # then set SESSION_SECRET
      bun run db:reset
      bun dev
      ```
    - Known limitations:
      - Single currency (USD).
      - No real payment integration; `orders.status` defaults to `'confirmed'`.
      - Stock race protection is a single-row `UPDATE … WHERE stock >= ?` inside a transaction; no two-phase reservation.
      - No email verification, no password reset.
      - `e2e/` directory exists but is unused in this milestone.

## Out-of-scope

- No payment integration.
- No order cancellation, no refunds.
- No `/orders/[id]` separate route — success page doubles as detail.
- No CSV export, no admin UI, no webhooks.

## Manual QA checklist

- [ ] **Happy path:** logout → fresh login → browse → filter by category → open detail → add 2 items → open CartDrawer → click "Checkout" → fill the form (`Test User`, `123 Demo St`, `Springfield`, `12345`) → submit → land on `/checkout/success/<id>`. Order summary shows the same items, snapshot prices, and the shipping address you entered.
- [ ] After success, **CartDrawer is empty** (cart cleared).
- [ ] `/orders` lists the new order with date + total + item count. Click → routes to `/checkout/success/<id>`.
- [ ] Hard reload `/orders` and `/checkout/success/<id>` — both persist.
- [ ] **Validation:** clear the `zip` field, click submit → inline `<FieldError>` reads "Digits only (4–10)"; submit button disabled (`canSubmit === false` via `form.Subscribe`). Server-side bypass via `curl -X POST /api/orders -d '{"name":"x","address":"y","city":"z","zip":"abc"}' -H 'content-type: application/json' --cookie ...` → 400 `{error:'invalid_form', fields:{ zip: ["Digits only (4–10)"] }}`.
- [ ] **Body-size cap:** `curl -sX POST /api/orders -H 'content-type:application/json' -H 'content-length: 100000' --data-binary "$(node -e 'process.stdout.write(\"{}\".padEnd(100000))')" --cookie ...` → `413 payload_too_large`.
- [ ] **Empty cart guard:** clear cart, navigate to `/checkout` → empty-state panel; trying to POST anyway via curl → 400 `cart_empty`.
- [ ] **Stock race:** in two browser profiles, both add the last unit of a product to their cart, both reach `/checkout` and submit at the same time. **Exactly one** order succeeds; the other gets a toast `Not enough stock` and the order is not created. `sqlite3 data/app.db "SELECT stock FROM products WHERE id=…"` confirms stock = 0 (not -1).
- [ ] **Order isolation:** as user A, copy an order id; log in as user B; visit `/checkout/success/<that-id>` → 404.
- [ ] **Snapshot integrity:** after placing an order, manually update the product price in DB (`UPDATE products SET price_cents = 99999 WHERE id = …`); refresh `/checkout/success/<id>` → totals still reflect the original snapshot prices, not the new product price.
- [ ] Header shows "Orders" link only when authed.
- [ ] `bun run lint` clean; no TypeScript errors (`tsc --noEmit`).

## Exit criteria

- Full happy path works end-to-end (browse → cart → checkout → success → orders list).
- Stock decrement is atomic and survives the concurrency test.
- Snapshots in `order_items` are immutable across product price changes.
- Checkout form uses TanStack Form + `checkoutShippingSchema` (Wk 4.5); no parallel hand-rolled validator exists.
- README hand-off block lives at the repo root.
- Demo can be reset cleanly with `bun run db:reset && bun dev`.

## Transition

Demo is feature-complete. No further sprints planned in this milestone. Future opportunities (post-milestone):

- Real payment integration — Stripe Checkout would slot in cleanly between the form submission and `createOrderForUser`.
- Activate the `e2e/` directory with Playwright covering the happy path enumerated above.
- Stock event log / two-phase reservation if the demo evolves into multi-tenant.
- Order statuses (`shipped`, `cancelled`) + a tiny admin view.
