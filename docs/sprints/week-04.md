# Week 4 — Filter / Sort / Search

## Goals

Make the catalog explorable. A FilterBar above the grid drives a category dropdown, a sort dropdown, and a search input — all state lives in the URL search params so links / refresh / back-button restore the view exactly. Search is debounced. TanStack cache hits per filter combo.

## Dependencies (from prior weeks)

- Wk 1: providers, ky client.
- Wk 2: `/api/products` honors `category`, `sort`, `q` already; `listProducts` exists; sort allowlist locked.
- Wk 3: `useProducts`, `ProductCard`, grid scaffolding, currency formatter.

## Pre-flight reading

- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`

## In-scope tasks

1. **Add shadcn primitives — ASK USER before running:**
   ```bash
   bunx shadcn@latest add select input separator
   ```
2. **Add `app/api/products/categories/route.ts`:**
   ```ts
   export const dynamic = 'force-dynamic'
   export async function GET() {
     return Response.json(listCategories())
   }
   ```
   `listCategories()` already lives in `lib/db/queries.ts` (Wk 2). Returns distinct category strings ordered alphabetically.
3. **Add `useCategories` hook** in `lib/hooks/useCategories.ts` — `useQuery({ queryKey: ['categories'], queryFn: ..., staleTime: 5 * 60_000 })` (categories rarely change; cache aggressively).
4. **Create `components/FilterBar.tsx`** (client):
   - Reads URL state via `useSearchParams()` + `usePathname()` + `useRouter()`.
   - Three controls:
     - **Category** shadcn `<Select>` — options = `['All', ...categories]`. "All" pushes empty value.
     - **Sort** shadcn `<Select>` — options matching `SORT_COLUMNS` keys: `newest`, `price_asc`, `price_desc`, `name_asc`. Labels: `Newest`, `Price ↑`, `Price ↓`, `Name A–Z`.
     - **Search** shadcn `<Input>` — text input, placeholder `Search products…`.
   - **State source-of-truth = URL.** Local component state is only used for the *uncommitted* search-input value (otherwise every keystroke triggers navigation).
   - Search debounce: 250 ms via a `useRef<NodeJS.Timeout>`. On settle → `router.replace(\`?\${nextParams.toString()}\`, { scroll: false })`.
   - Category / sort changes commit immediately (no debounce).
   - Helper `function setParam(name, value)` — reads current params, sets/deletes the named key, calls `router.replace`.
5. **Update `app/page.tsx`:**
   - Read `useSearchParams()` → derive `{ category, sort, q }` (typed, with safe defaults).
   - Pass them to `useProducts({ category, sort, q, limit: 24 })`.
   - Render `<FilterBar />` above the grid.
   - Empty state copy when `q || category` is set: "No products match your filters." with a "Clear filters" button → `router.replace(pathname)`.

## Out-of-scope

- No pagination UI (limit is fixed at 24, server cap 50). If the grid feels tiny later, revisit; the demo's 20 SKUs fit comfortably.
- No detail page yet (Week 5).
- No cart (Week 7).

## Manual QA checklist

- [ ] Change category dropdown → URL becomes `?category=apparel` and grid updates without flash.
- [ ] Change sort to "Price ↑" → URL becomes `?sort=price_asc&...`; first card has the lowest price; last card has the highest.
- [ ] Type a search query → after 250 ms of idle the URL updates to `?q=foo`; mid-typing does not navigate.
- [ ] Combine all three (`?category=apparel&sort=price_desc&q=shirt`) → grid filters as expected.
- [ ] Hit Refresh on a deep-linked URL → state restored exactly, no flicker.
- [ ] Browser Back / Forward replays each filter step.
- [ ] Empty result → empty-state copy + working "Clear filters" button.
- [ ] React Query DevTools → switching back to a previous filter combo is instant (cache hit, no network).
- [ ] Type a search query containing `'%'` and `_` → server returns sane results (LIKE wildcards are treated literally because we wrap user input with `%…%` and rely on parameterised binding only — they should NOT explode the result set).
- [ ] Inspect Network tab → no request fires when changing the input character-by-character within 250 ms.

## Exit criteria

- FilterBar fully URL-driven, debounced.
- `/api/products/categories` reachable; populates the category dropdown.
- All filter combos round-trip through reload, back/forward, deep-link.
- TanStack cache keyed per param combo (visible in DevTools).

## Transition to Week 5

The list page is feature-complete. Week 5 builds the product detail page at `/products/[slug]` as a server component — direct DB read via `getProductBySlug`, gallery image via `next/image`, specs panel, plus a placeholder `AddToCartButton` client island that toasts "sign in to add" until Wk 7 wires real cart mutations. `loading.tsx` and `not-found.tsx` give the route real failure-mode UX. Week 5 has *no* dependency on this week's filters — it could ship before Wk 4 if priorities flipped.
