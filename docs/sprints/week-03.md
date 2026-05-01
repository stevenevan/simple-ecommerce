# Week 3 — Homepage Product Grid

## Goals

Render the catalog on the homepage: shadcn product cards in a responsive grid, fed by TanStack Query against `/api/products`, with skeleton + empty + error states. End of week: a visitor lands on `/`, sees 20 products with images, names, prices, and category badges; opening dev-throttling shows skeletons; killing the API shows an error state with a retry button.

## Dependencies (from prior weeks)

- Wk 1: providers wired, ky client.
- Wk 2: `/api/products` returning rows; `lib/types.ts` has `Product`.

## Pre-flight reading

- `node_modules/next/dist/docs/01-app/01-getting-started/12-images.md` (next/image in 16)
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`

## In-scope tasks

1. **Add shadcn primitives — ASK USER before running** (each `add` may pull new deps):
   ```bash
   bunx shadcn@latest add card button badge skeleton aspect-ratio
   ```
2. **Create `lib/format.ts`:**
   ```ts
   const FMT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
   export function formatCurrency(cents: number): string {
     return FMT.format(cents / 100)
   }
   ```
   No locale/currency params — single hardcoded formatter.
3. **Create `lib/hooks/useProducts.ts`** (client):
   ```ts
   export function useProducts(params: ProductListQuery) {
     const search = new URLSearchParams(/* serialize defined fields */)
     return useQuery({
       queryKey: ['products', search.toString()],
       queryFn: async () => {
         try { return await api.get('products', { searchParams: search }).json<Product[]>() }
         catch (e) { /* parse HTTPError → throw Error(serverMsg) */ }
       },
     })
   }
   ```
   `ProductListQuery` lives in `lib/types.ts`: `{ category?: string; sort?: SortKey; q?: string; limit?: number; offset?: number }`.
4. **Create `components/ProductCard.tsx`:**
   - Wraps a shadcn `<Card>` in a `next/link` to `/products/[slug]`.
   - `next/image` with `width={400}`, `height={400}`, `alt={product.name}`, `className="object-cover"` inside a shadcn `<AspectRatio ratio={1}>`.
   - Card body: `<Badge variant="secondary">{category}</Badge>`, `<h3>{name}</h3>`, `<p>{formatCurrency(price_cents)}</p>`.
   - Out-of-stock badge when `stock === 0`.
5. **Create `components/ProductGridSkeleton.tsx`:** renders 8 shadcn `<Skeleton>` cards with the same outer shape as `ProductCard`.
6. **Create `components/Header.tsx`** (server component, exported default):
   - Logo / title link to `/`.
   - Right-side slot for cart / user menu — leave a `{children}` slot **or** an empty `<div data-slot="header-right" />` placeholder. (Header grows in Wk 6 + Wk 7 + Wk 8.)
   - Use plain `<a>` for now since no auth links yet.
7. **Update `app/layout.tsx`** to render `<Header />` above `{children}`. Container max-width via Tailwind utility classes.
8. **Rewrite `app/page.tsx`** as a client component:
   ```tsx
   'use client'
   export default function Home() {
     const { data, isPending, isError, refetch } = useProducts({ limit: 24 })
     if (isPending) return <ProductGridSkeleton />
     if (isError)   return <ErrorState onRetry={refetch} />
     if (!data?.length) return <EmptyState />
     return <Grid items={data} />
   }
   ```
   Keep components small; extract `Grid`, `ErrorState`, `EmptyState` into `app/page.tsx` as local helpers (single file is fine — they are page-specific).

## Out-of-scope

- No filter / sort / search UI (Week 4).
- No detail page (Week 5) — cards link to a route that 404s for now; that is acceptable and called out in QA.
- No cart, no auth.

## Manual QA checklist

- [ ] `bun dev` → `/` renders 20 cards in a 1/2/3/4-column grid (resize window to verify breakpoints).
- [ ] Each card shows the seed image (or the `missing.jpg` fallback if the seed couldn't find one).
- [ ] Prices display as e.g. `$24.99` — never `2499` raw, never `$24.990000001`.
- [ ] Chrome DevTools → Network → "Slow 3G" + reload → skeletons visible for ≥ 1 s before cards appear.
- [ ] Stop the dev server mid-session, hard reload `/` → error state visible with a working "Retry" button (after restarting server, retry succeeds).
- [ ] Manually drop the products table (`sqlite3 data/app.db "DELETE FROM products"`) → reload → empty state visible. Re-seed (`bun run db:seed`) restores the grid.
- [ ] Click a card → navigates to `/products/<slug>` and shows Next.js 404 page (expected — Wk 5 builds the page).
- [ ] No console errors / hydration mismatches.

## Exit criteria

- Homepage renders the seeded catalog via TanStack Query against `/api/products`.
- Loading, error, and empty states all reachable on demand.
- Currency formatter shared via `lib/format.ts`.
- Header shell mounted in the root layout.

## Transition to Week 4

The grid renders everything in default `newest` order — visitors can't drill in yet. Week 4 adds the FilterBar (category dropdown + sort dropdown + search input), URL-syncs the state via `useSearchParams`, and adds the supporting `/api/products/categories` endpoint. `useProducts` already keys by serialised search params, so each filter combo will cache cleanly.
