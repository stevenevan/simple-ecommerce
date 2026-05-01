# Week 5 — Product Detail Page

## Goals

Add the public product detail route at `/products/[slug]`. The page is a **server component** that reads SQLite directly — no `/api/*` round-trip — for instant first paint. A small client island (`AddToCartButton`) handles the only interactive surface; for now it toasts "Sign in to add to cart" because the cart endpoints don't exist yet (Week 7).

## Dependencies (from prior weeks)

- Wk 2: `getProductBySlug` exists; product schema stable.
- Wk 3: shadcn primitives installed; currency formatter; `Header`.
- Wk 4 is **NOT** required — this sprint is independent of FilterBar.

## Pre-flight reading

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` (async `params`)
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/12-images.md`

## In-scope tasks

1. **Add shadcn primitives — ASK USER before running:**
   ```bash
   bunx shadcn@latest add tabs
   ```
2. **Create `app/products/[slug]/page.tsx`** (server component):
   ```tsx
   import { notFound } from 'next/navigation'
   import { getProductBySlug } from '@/lib/db/queries'

   export const dynamic = 'force-dynamic'

   export default async function ProductDetailPage({
     params,
   }: { params: Promise<{ slug: string }> }) {
     const { slug } = await params
     const product = getProductBySlug(slug)
     if (!product) notFound()
     return <ProductDetail product={product} />
   }
   ```
   - `params` is a Promise in Next 16 — always `await`.
   - `force-dynamic` because data is local-DB-backed and we want fresh reads after `bun run db:reset` during dev.
   - **Public route — no `ensureSession()`.** Anyone can browse a product. The AddToCart island handles unauth.
3. **Create `app/products/[slug]/loading.tsx`** — detail-page skeleton (image block + 4 lines of text).
4. **Create `app/products/[slug]/not-found.tsx`** — friendly 404 with a button linking back to `/`.
5. **Create `components/ProductImage.tsx`** — server component wrapping `next/image` (`width={800}`, `height={800}`, `priority`). Falls back to `/seed-images/missing.jpg` on missing image.
6. **Create `components/ProductSpecs.tsx`** — server component, renders name (h1), category badge, formatted price, description, stock indicator (`In stock (N)` or `Out of stock`).
7. **Create `components/AddToCartButton.tsx`** (client island) — placeholder shape:
   ```tsx
   'use client'
   type Props = { productId: number; stock: number }
   export function AddToCartButton({ productId, stock }: Props) {
     const disabled = stock === 0
     return (
       <Button
         disabled={disabled}
         onClick={() => toast.message('Sign in to add to cart', {
           action: { label: 'Sign in', onClick: () => router.push('/login') }
         })}
       >
         {disabled ? 'Out of stock' : 'Add to cart'}
       </Button>
     )
   }
   ```
   **Lock these props (`{ productId, stock }`)** — Wk 7 swaps the body without changing the prop signature.
8. **Compose `ProductDetail` (page-local component)** — two-column layout: image left, specs + AddToCartButton right. Use shadcn `<Tabs>` if you want a "Description / Specs" split, otherwise plain stacked sections.

## Out-of-scope

- No real cart wiring (Week 7).
- No related-products list — out of scope for the demo.
- No reviews, no ratings, no inventory log.

## Manual QA checklist

- [ ] Click any product card on `/` → navigates to `/products/<slug>`; image, name, price, description, stock all visible.
- [ ] Hard reload `/products/<slug>` → no flash, server-rendered HTML includes the product data (View Source contains `formatCurrency` output).
- [ ] Visit `/products/does-not-exist` → custom not-found page renders (not the framework default).
- [ ] Throttle to "Slow 3G" → navigating from `/` to a product shows the `loading.tsx` skeleton briefly.
- [ ] Click **Add to cart** → sonner toast "Sign in to add to cart" with a "Sign in" action that navigates to `/login` (route 404s for now — expected; Wk 6 builds it).
- [ ] On a product whose seed has `stock = 0` (manually set one via `sqlite3 data/app.db "UPDATE products SET stock=0 WHERE id=1"`) → button reads "Out of stock" and is disabled. Reset stock after testing.
- [ ] No console errors / hydration mismatches.
- [ ] Lighthouse Performance score on the detail page ≥ 90 (local — informational only; do not block on this).

## Exit criteria

- `/products/[slug]` renders for every seeded slug.
- 404 path uses the custom `not-found.tsx`.
- Loading skeleton reachable under network throttling.
- AddToCartButton ships with locked-in `{ productId, stock }` props.
- Detail page is server-component-rendered; no client `useQuery` for the product itself.

## Transition to Week 6

Browsing is complete (list + detail). Week 6 introduces identity: `iron-session` cookie, `bcryptjs` password hashing, register / login / logout / me endpoints, login & register pages, a demo account `demo@example.com` / `Demo1234!` (already seeded in Wk 2), and a header user menu. Week 6 also creates *empty-bodied* cart query helpers (`getOrCreateCart`, `listCartItems`, `upsertCartItem`, `updateCartItemQty`, `removeCartItem`) so Wk 7 only fills in the SQL. Without auth in place, Week 7's cart cannot attach items to anyone.
