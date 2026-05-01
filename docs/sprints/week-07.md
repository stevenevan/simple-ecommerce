# Week 7 — Cart

## Goals

Cart goes from concept to a working, persisted, auth-gated feature. Fill in the cart query bodies stubbed in Wk 6, expose the four cart endpoints, build the `useCart` + mutation hooks, drop the `CartDrawer` shadcn-`<Sheet>`, and swap the Wk 5 `AddToCartButton` placeholder for a real mutation. Toasts surface every success and error.

## Dependencies (from prior weeks) — ALL HARD PREREQS

- Wk 2: `cart_items` table + indexes; `Product` type.
- Wk 5: `AddToCartButton` placeholder with locked-in `{ productId, stock }` props.
- Wk 6: `ensureSession`, cart query stubs, `useMe`, mutation cache hygiene patterns.

## Pre-flight reading

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` (route handler `params` is also a Promise)
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`

## In-scope tasks

1. **Add shadcn primitives — ASK USER before running:**
   ```bash
   bunx shadcn@latest add sheet dialog
   ```
2. **Fill cart query bodies in `lib/db/queries.ts`** (replacing Wk 6 stubs):
   - `getOrCreateCart(userId)` — `SELECT id FROM carts WHERE user_id = ?`; if missing, `INSERT INTO carts (user_id) VALUES (?) RETURNING id`. Wrap in `db.transaction(...)`.
   - `listCartItems(cartId)` — **single JOIN**, no per-item lookup loop:
     ```sql
     SELECT ci.id, ci.product_id, ci.quantity,
            p.name, p.price_cents, p.image_url, p.stock, p.slug
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = ?
     ORDER BY ci.id
     ```
     Returns `CartItemView[]`.
   - `upsertCartItem(cartId, productId, qty)` — uses `INSERT … ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`. Wrapped in `db.transaction`.
   - `updateCartItemQty(itemId, cartId, qty)` — `UPDATE … WHERE id = ? AND cart_id = ?`; rejects qty <= 0 (route handler catches and 400s).
   - `removeCartItem(itemId, cartId)` — `DELETE … WHERE id = ? AND cart_id = ?`. Both `update` and `remove` scope by `cart_id` to prevent cross-account tampering.
3. **Add helpers to `lib/db/queries.ts`:**
   - `getProductForCart(productId): Pick<Product, 'id'|'price_cents'|'stock'> | null` — used by `POST /api/cart/items` to validate stock and read price server-side.
4. **Cart route handlers** — every one declares `export const dynamic = 'force-dynamic'`:
   - `app/api/cart/route.ts` — **GET**:
     ```ts
     const user = await ensureSession()
     const cart = getOrCreateCart(user.id)
     const items = listCartItems(cart.id)
     const subtotalCents = items.reduce((s, i) => s + i.price_cents * i.quantity, 0)
     return Response.json({ items, subtotalCents })
     ```
   - `app/api/cart/items/route.ts` — **POST** body `{ productId: number, quantity: number }`:
     - `ensureSession`, validate `Number.isInteger(quantity) && quantity > 0`.
     - `getProductForCart(productId)` → 404 if missing.
     - Read existing cart-line qty (if any). If `existingQty + quantity > product.stock` → 409 `{ error: 'insufficient_stock' }`.
     - `getOrCreateCart` → `upsertCartItem` → return 200 `{ ok: true }`.
   - `app/api/cart/items/[id]/route.ts` — **PATCH** + **DELETE**:
     - `await params` to read `id`.
     - `ensureSession` → `getOrCreateCart`.
     - **PATCH** body `{ quantity }`. Validate `quantity >= 1`. Look up the item, confirm it belongs to caller's cart, check `quantity <= product.stock` (re-read product), update.
     - **DELETE**: `removeCartItem(id, cart.id)` — if no row affected, 404.
5. **`lib/hooks/useCart.ts`:**
   ```ts
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
6. **`lib/hooks/useCartMutations.ts`** — `useAddItem`, `useUpdateQty`, `useRemoveItem`:
   - All catch ky `HTTPError`, parse `{error}`, re-throw `Error(message)`.
   - `onSuccess` → `queryClient.invalidateQueries({ queryKey: ['cart'] })` and `toast.success(...)` (e.g. `'Added to cart'`, `'Cart updated'`, `'Removed'`).
   - `onError` → `toast.error(err.message)` (server message like `'insufficient_stock'` should be re-mapped to a friendly string at the toast site — keep the mapping table small and local, e.g. `{ insufficient_stock: 'Not enough stock', unauthorized: 'Please sign in' }`).
7. **`components/CartDrawer.tsx`** (client):
   - Trigger: cart icon `<Button variant="ghost">` in the Header with a `<Badge>` showing `useCart().data?.items.length ?? 0` (only when authed; hidden otherwise).
   - shadcn `<Sheet>` opens from the right.
   - Body lists items: small image + name + price + qty `+ / -` (uses `useUpdateQty`) + remove (`useRemoveItem`). Disabled `+` when at `stock`.
   - Footer: subtotal (formatted), `<Button>` "Checkout" → `router.push('/checkout')`.
   - Empty state: "Your cart is empty" with a link to `/`.
8. **Real wiring of `AddToCartButton`** (replaces Wk 5 placeholder body — **same props `{ productId, stock }`**):
   ```tsx
   'use client'
   const { data: me } = useMe()
   const addItem = useAddItem()
   const [qty, setQty] = useState(1)
   const clamped = Math.min(Math.max(qty, 1), stock)
   const onClick = () => {
     if (!me?.user) {
       toast.message('Sign in to add to cart', {
         action: { label: 'Sign in', onClick: () => router.push('/login') },
       })
       return
     }
     addItem.mutate({ productId, quantity: clamped })
   }
   // render qty +/- controls (disabled at boundaries) + main button (disabled when stock=0 or addItem.isPending)
   ```
9. **Update `Header.tsx`** to mount `<CartDrawer />` to the right of the user menu (or in place of it for unauthed users — show a disabled cart icon with a tooltip "Sign in to use cart" instead of hiding entirely).

## Out-of-scope

- No checkout (Week 8).
- No `/orders` page (Week 8).
- No cart abandonment recovery, no "save for later".

## Manual QA checklist

- [ ] Logged out: cart icon in header is hidden (or disabled with tooltip per choice). `curl -X POST http://localhost:3000/api/cart/items -d '{"productId":1,"quantity":1}' -H 'content-type: application/json'` → 401.
- [ ] Log in (demo creds). Open detail page. **Add to cart** → toast "Added to cart" appears; cart icon badge becomes `1`.
- [ ] Open CartDrawer → item shown with correct name, price, image, qty 1.
- [ ] Click `+` → qty becomes 2; subtotal doubles. Server received PATCH; refetch confirms in DevTools.
- [ ] Set qty above stock via `+` clicks → button disables at the cap. Manually call `curl -X PATCH http://localhost:3000/api/cart/items/<id> -d '{"quantity":9999}'` → 400 or 409 with friendly server error.
- [ ] Remove → row disappears; toast "Removed".
- [ ] Add a second product → drawer shows two rows; subtotal sums.
- [ ] Hard reload `/` → cart persists; drawer reopens with the same items.
- [ ] **Cross-session persistence test (same machine, two browser profiles):** open Chrome regular profile and Chrome guest/incognito profile; log in as `demo@example.com` in both; add an item in profile A; refresh profile B → drawer shows the same item (proves DB-backed, not local state).
- [ ] Try to exceed stock via `POST /api/cart/items` with a giant quantity → server returns 409 with `{error:'insufficient_stock'}`; toast surfaces "Not enough stock".
- [ ] Logout → drawer cleared, badge gone, `['cart']` query removed (DevTools).
- [ ] React Query DevTools → `['cart']` only present when `useMe().data.user` exists.

## Exit criteria

- All four cart endpoints work and are auth-gated.
- `listCartItems` returns a single-JOIN result; no N+1 loop.
- AddToCartButton wired without changing its prop signature.
- CartDrawer mounted from header; survives reload; respects stock cap on both client and server.
- Cross-profile test passes.

## Transition to Week 8

Cart is persistent and authoritative. Week 8 turns a cart into an order: `POST /api/orders` runs a single `db.transaction` that **decrements `products.stock` per line** with `WHERE stock >= ?` (race protection — abort with 409 if `changes === 0`), inserts `orders` and snapshotted `order_items`, then clears `cart_items`. The checkout page is a hand-rolled form (no `react-hook-form`, no `zod`); validators extend `lib/validators.ts`. After success, `/orders` lists the user's history. Each row links to `/checkout/success/[id]` — that page **is** the canonical order detail; no separate `/orders/[id]` page.
