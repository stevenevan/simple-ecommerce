# Week 1 — Foundation & Tooling

## Goals

Get the empty `create-next-app` shell turned into a project where every later sprint can drop in features without re-bootstrapping. Install the locked-in stack, wire the providers, and verify a green health-check endpoint under Turbopack.

## Dependencies (from prior weeks)

None — first sprint.

## Pre-flight reading (before writing any Next 16 code)

- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md`

## In-scope tasks

1. **Verify environment.** **Node 24** (`node --version` → `v24.x.x`). Bun present (`bun --version`). Add `.nvmrc` containing `24` and `engines.node: ">=24"` in `package.json`.
2. **Inspect `next.config.ts`** — confirm `cacheComponents` is **not** set. Record in this file's "Caching model" section: *Cache Components OFF; legacy route-segment-config (`dynamic`, `revalidate`) in force for all 8 sprints.*
3. **Install runtime deps — ASK USER before running:**
   ```bash
   bun add better-sqlite3 @tanstack/react-query @tanstack/react-query-devtools \
           ky iron-session bcryptjs sonner
   bun add -D @types/better-sqlite3 @types/bcryptjs
   ```
4. **Initialise shadcn/ui** (Tailwind v4 already installed) — **ASK USER before running** (writes deps + scaffolding):
   ```bash
   bunx shadcn@latest init
   ```
   Choose neutral base colour, default paths (`components/`, `components/ui/`, `lib/utils.ts`).
5. **Create `app/providers.tsx`** (client component):
   - Owns a `QueryClient` (instantiated lazily inside a `useState` initialiser so it survives RSC re-renders).
   - Default options: `queries: { staleTime: 30_000, refetchOnWindowFocus: false }`.
   - Renders `<QueryClientProvider>{children}</QueryClientProvider>` plus `<Toaster richColors position="top-right" />` from `sonner`.
   - Includes `<ReactQueryDevtools initialIsOpen={false} />` (gated behind `process.env.NODE_ENV !== 'production'`).
6. **Update `app/layout.tsx`** — wrap `{children}` in `<Providers>`. Update `<Metadata>` to `title: 'Simple E-Commerce'`, `description: 'Demo storefront'`. Keep the existing Geist fonts.
7. **Replace template `app/page.tsx`** with a placeholder shell:
   ```tsx
   export default function Home() {
     return <main className="container mx-auto p-8" />
   }
   ```
8. **Add `app/api/health/route.ts`:**
   ```ts
   export async function GET() {
     return Response.json({ ok: true })
   }
   ```
   Do **not** grow this file in later sprints — it stays a sanity probe.
9. **Create `lib/api-client.ts`:**
   ```ts
   import ky from 'ky'
   export const api = ky.create({
     prefixUrl: '/api',
     credentials: 'include',
     throwHttpErrors: true,
   })
   ```
   **Pinned policy:** ky throws on 4xx/5xx. Mutations and queries catch `HTTPError`, parse `error.response.json()` for `{ error: string }`, and re-throw a normal `Error(message)` so TanStack `onError` can surface it via `toast.error`.
10. **Update `.gitignore`** — append `data/` and `data/app.db*`.

## Out-of-scope (explicit punts)

- No DB migrations, no schema, no seed (Week 2).
- No homepage UI beyond the empty shell (Week 3).
- No `lib/db/*`, `lib/session.ts`, `lib/auth.ts` yet (Weeks 2 / 6).
- No `e2e/` work — folder stays untouched.

## Manual QA checklist

- [ ] `node --version` → `v24.x.x`.
- [ ] `bun install` completes without native-build errors under Node 24. If `better-sqlite3` fails, document the npm fallback in README.
- [ ] `bun dev` starts on `http://localhost:3000` under Turbopack with no warnings.
- [ ] `/` renders an empty page; DOM has the `<main>` shell; no console errors / hydration mismatches.
- [ ] `curl -s http://localhost:3000/api/health` → `{"ok":true}` (HTTP 200).
- [ ] React Query DevTools floating button visible in dev.
- [ ] Trigger a manual `toast.success('hello')` from the browser console (`window.dispatchEvent` not needed — temporarily wire a button in `page.tsx`, test, revert before commit) — toast appears top-right.
- [ ] `bun run lint` passes.

## Exit criteria

- Stack installed and locked in `package.json` / `bun.lock`.
- `app/providers.tsx`, `app/api/health/route.ts`, `lib/api-client.ts` committed.
- `.gitignore` updated.
- `next.config.ts` confirmed empty (no `cacheComponents`).
- `/api/health` returns `{ok:true}` over a fresh `bun dev`.

## Transition to Week 2

The shell is in place but the homepage has nothing to show. Week 2 brings the data layer online: SQLite singleton, schema migration, seeded JSON catalog, and the first real API surface — `GET /api/products` and `GET /api/products/[slug]`. Once those endpoints return real rows, Week 3 can render them.
