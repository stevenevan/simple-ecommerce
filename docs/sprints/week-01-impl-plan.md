# Week 1 — Implementation Plan

Implements `docs/sprints/week-01.md`. Source of truth = that sprint file; this plan is the executable breakdown.

## 1. Context

`create-next-app` shell. Need: stack installed, providers wired, `/api/health` green under Turbopack, on Node 24 with `cacheComponents` OFF. No DB/auth/UI work this sprint.

## 2. Pre-flight blockers (resolve BEFORE any task)

1. **Node version mismatch.** `node --version` → `v22.22.0`. Sprint requires `v24.x.x`. Memory pin: "Node 24 across docs, configs, CI, engines field". → ASK USER: install/select Node 24 (e.g. `nvm install 24 && nvm use 24`) before continuing. Do not silently downgrade the requirement.
2. **Read pre-flight docs first** (paths verified to exist):
   - `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
   - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
   - `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md`
3. **`next.config.ts` already free of `cacheComponents`** — verified, no edit needed (only documentation).

## 3. Task list (numbered, with file paths and verify steps)

Pause for user approval at each step marked **ASK USER**.

### 3.0 Capture lint baseline
- Run `bun run lint` once before any edit. Record exit code + error count to scratch.
- This is the baseline V8 must match-or-improve. Catches "did sprint introduce regressions vs. did template already lint clean?"

### 3.1 Pin Node 24 (after user installs)
- Verify `node --version` matches `/^v24\./` — accept any `v24.x.x` (≥ 24.0.0). Hard-block otherwise.
- Write `.nvmrc` containing the literal `24` followed by a newline. Verify: `xxd .nvmrc | head -1` ends in `0a`.
- Edit `package.json` to add `"engines": { "node": ">=24" }`. Insertion point: between `"private": true,` (line 4) and `"scripts": {` (line 5). After edit, validate JSON with `node -e "require('./package.json')"` (must exit 0).
- Bump dev type defs in the same edit set: `bun add -D @types/node@^24` (matches new runtime; current pin is `^20`). **ASK USER first** (deps install).
- **Engines pin scope:** use `"engines": { "node": ">=24 <25" }` (closed upper bound). Open-ended `>=24` would also accept Node 25 when it ships, which can break `better-sqlite3` native builds.
- Verify: `grep '"engines"' package.json` and `grep '@types/node' package.json` both show `24`.

### 3.2 Document `cacheComponents` mode
- Sprint spec is ambiguous about whether the doc lands in `next.config.ts` or the sprint markdown. Do BOTH (cheap insurance):
  - The sprint file `docs/sprints/week-01.md:20` already records the mode. No edit.
  - Add a single comment line inside `next.config.ts`'s `nextConfig` object, replacing the placeholder `/* config options here */` with:
    ```ts
    // cacheComponents: OFF (default in 16.2.4). Use route-segment-config (dynamic / revalidate) for all 8 sprints.
    ```
- Verify: `grep cacheComponents next.config.ts` shows only the comment line; the actual key is NOT set.

### 3.3 Install runtime deps — **ASK USER before running**
```bash
bun add better-sqlite3 @tanstack/react-query @tanstack/react-query-devtools \
        ky iron-session bcryptjs sonner
bun add -D @types/better-sqlite3 @types/bcryptjs
```
- Run only after user confirms (project memory: never install without asking).
- Verify: `package.json` has all 7 runtime + 2 dev deps. Lockfile check is filename-agnostic — assert `git status` shows either `bun.lockb` or `bun.lock` modified (bun 1.3.x default is binary `bun.lockb`; do not hard-code).
- **Resolved-version sanity:** print and capture `bun pm ls --all 2>&1 | grep -E '(iron-session|bcryptjs|better-sqlite3|ky|sonner|@tanstack)'` to scratch. Confirm `iron-session` resolves to `^8.x` (the v8 API contract is what PLAN.md §6 Wk 6 depends on); if not, pin explicitly.
- **`trustedDependencies` review:** `package.json:26-33` already ships with `"ignoreScripts": ["sharp", "unrs-resolver"]` and `"trustedDependencies": ["sharp", "unrs-resolver"]`. **Preserve those existing entries.** If bun auto-adds `better-sqlite3` to either array, that is the only new entry permitted — reject any other addition (no `iron-session`, `bcryptjs`, `ky`, `sonner`, `@tanstack/*` — none of those have native postinstalls).
- **Audit gate (immediate):** `bun audit` (or `npx --yes audit-ci --high` if `bun audit` unavailable) — abort sprint on any HIGH/CRITICAL. Record output to scratch.
- If `better-sqlite3` native build fails under Node 24/bun: stop, surface the exact error, ASK USER whether to fall back to `npm install better-sqlite3` per Wk 1 README note. Do not retry silently.

### 3.4 Initialise shadcn/ui — **ASK USER before running**
**Pre-step (mandatory):** copy current `app/globals.css` to `app/globals.css.bak` (don't commit). The init may overwrite the Tailwind v4 `@theme inline` block including the Geist font bindings (`--font-geist-sans`, `--font-geist-mono`).
```bash
cp app/globals.css app/globals.css.bak
bunx shadcn@latest init
```
- Choices: neutral base colour, default paths (`components/`, `components/ui/`, `lib/utils.ts`).
- **Post-step:** `diff app/globals.css.bak app/globals.css`. If the `@theme inline` block (lines 8-13 of original) is gone, restore it verbatim:
  ```css
  @theme inline {
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --font-sans: var(--font-geist-sans);
    --font-mono: var(--font-geist-mono);
  }
  ```
  **Hard gate before deleting `.bak`:** `grep -c "var(--font-geist-sans)" app/globals.css` MUST return `1` AND `grep -c "var(--font-geist-mono)" app/globals.css` MUST return `1`. Diff exit code alone is not enough — partial overwrite would slip through.
  Then delete `app/globals.css.bak`.
- Verify: `components.json` exists at repo root; `lib/utils.ts` created and exports `cn` (`grep -F "export function cn" lib/utils.ts` returns 1 match — Wk 3+ shadcn components import `cn` and a missing export breaks the build silently); `@import "tailwindcss"` and both Geist font bindings still present in `app/globals.css`.

### 3.5 Create `app/providers.tsx` (client component)
```tsx
'use client'

// QueryClient is constructed ONLY here (per-render in a useState initialiser).
// Do not spin up another QueryClient elsewhere — Wk 6/7 hooks must consume this one.
import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'sonner'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster richColors position="top-right" />
      {process.env.NODE_ENV !== 'production' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  )
}
```
- The lazy `useState(() => new QueryClient(...))` idiom is correct for Next App Router + React 19 streaming SSR (per-request client on the client side; never shared across requests).
- Verify: file compiles, no missing imports.

### 3.6 Update `app/layout.tsx`
- Wrap `{children}` in `<Providers>{children}</Providers>`.
- Add `import { Providers } from './providers'` at top.
- Update `metadata` to `{ title: 'Simple E-Commerce', description: 'Demo storefront' }`.
- Preserve **exactly** these existing classes (do not rewrite the JSX from scratch):
  - `<html>` className: `` `${geistSans.variable} ${geistMono.variable} h-full antialiased` `` (`app/layout.tsx:26-29`)
  - `<body>` className: `min-h-full flex flex-col` (`app/layout.tsx:30`)
- Keep existing Geist font imports/instantiations untouched.
- Verify: react-tree shows `<Providers>` wrapping page content; `grep -F "min-h-full flex flex-col" app/layout.tsx` returns 1 match; `grep -F "h-full antialiased" app/layout.tsx` returns 1 match.

### 3.7 Replace `app/page.tsx`
- Replace entire content (currently 65 lines of `create-next-app` template) with:
  ```tsx
  export default function Home() {
    return <main className="container mx-auto p-8" />
  }
  ```
- Drop the unused `import Image from 'next/image'`.
- Verify: `/` renders empty page, no console errors, no hydration mismatch.

### 3.8 Add `app/api/health/route.ts`
- Create file:
  ```ts
  export const dynamic = 'force-dynamic'

  export async function GET() {
    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
  ```
- **Why `dynamic = 'force-dynamic'` + `Cache-Control: no-store`:** with `cacheComponents` OFF, a route handler that has zero dynamic signals (no `request`, no `cookies()`, no `searchParams`) is statically optimised at build time. A static `{ok:true}` would pass V5 forever even if the runtime is broken — defeating the purpose of a sanity probe. Force the handler to run per request and instruct any upstream proxy not to cache it.
- Verify: `curl -sI http://localhost:3000/api/health` shows `Cache-Control: no-store`; body is `{"ok":true}`; HTTP 200.
- Pinned policy: file is a sanity probe; do not extend it in any later sprint.

### 3.9 Create `lib/api-client.ts`
- File (matches Wk 1 spec verbatim — `credentials: 'include'`):
  ```ts
  import ky from 'ky'

  export const api = ky.create({
    prefixUrl: '/api',
    credentials: 'include',
    throwHttpErrors: true,
  })
  ```
- **Note (do NOT change without user approval):** sprint spec pins `credentials: 'include'`. `'same-origin'` would be marginally tighter for this same-origin demo and would protect against future drift to a CDN-fronted absolute `prefixUrl`, but deviating from the sprint spec needs an explicit user OK. Surface the question in the final summary, do not change unilaterally.
- Layer rule (carried from PLAN.md §7): client-only. Server components / route handlers must NOT import it.
- Verify: file compiles; no other imports yet (only consumed in Wk 3+).
- **Layer-rule guard (broadened, run after task complete):**
  ```bash
  ! grep -RIn "from '@/lib/api-client'\|from '\.\./lib/api-client'\|from '\./api-client'" \
        app/api lib/db lib/auth.ts lib/session.ts 2>/dev/null
  ```
  Must exit 0 (no matches). Today only `app/api/` exists; the other paths will appear in Wk 2/6, and the guard is forward-compatible.

### 3.10 Update `.gitignore`
- **Spec deviation (security-driven):** sprint says append `data/` and `data/app.db*` wholesale. But PLAN.md §4 commits `data/seed/products.json` (Wk 2) — a plain `data/` would silently ignore that file. Use a more precise ignore that captures sprint intent without breaking Wk 2:
  ```
  # local sqlite (gitignored — see Wk 2 db:reset)
  /data/app.db
  /data/app.db-shm
  /data/app.db-wal
  /data/app.db*

  # but keep seed assets committed (Wk 2)
  !/data/seed/

  # env example must always be committable (Wk 6)
  !.env.example
  ```
- The leading `/` anchors to repo root (avoids matching `node_modules/data/...`). The `data/app.db*` glob covers WAL siblings (`-shm`, `-wal`) created by `PRAGMA journal_mode = WAL`; explicit lines are redundant but greppable.
- Verify:
  - `mkdir -p data && touch data/app.db data/app.db-wal data/app.db-shm data/seed/x.json && git check-ignore data/app.db data/app.db-wal data/app.db-shm` all succeed; `git check-ignore data/seed/x.json` exits non-zero (NOT ignored). Then clean up: `rm data/app.db* data/seed/x.json`.

### 3.11 Add ESLint `no-restricted-imports` to encode layer rules
- Wk 1 owns `eslint.config.mjs`; cheapest moment to encode PLAN.md §7 layer direction. Add a rule to the existing config (append to the `defineConfig([...])` array):
  ```js
  {
    files: ['app/api/**/*.{ts,tsx}', 'lib/db/**/*.{ts,tsx}', 'lib/auth.ts', 'lib/session.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/lib/api-client', '**/lib/api-client'],
            message: 'lib/api-client is client-only — server code must call lib/db/queries directly (PLAN.md §7).' },
        ],
      }],
    },
  },
  ```
- Today only `app/api/**` and `lib/api-client.ts` exist; the rule covers Wk 2/6 paths in advance without requiring those files to exist (ESLint just no-ops on absent files).
- Verify: `bun run lint` still exits 0 (no current file violates the rule); the rule is greppable in `eslint.config.mjs`.

### 3.12 (OPTIONAL — ASK USER) Reserve security headers slot in `next.config.ts`
- **Sprint spec does not require this.** Security audit flagged it HIGH because Wk 6/8 will land auth and checkout without any header posture. Cheap to add now; medium cost to add later once the surface is live.
- If user approves, add to `nextConfig`:
  ```ts
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options',         value: 'DENY' },
        ],
      },
    ]
  }
  ```
- Defer CSP to Wk 6 (script sources unknown until auth UI lands).
- Verify: `curl -sI http://localhost:3000/` shows the three headers.
- **If user declines:** mark §3.12 SKIPPED in Review Trail; add a Wk 6 follow-up note.

## 4. Implementation order

```
3.0 (lint baseline)
3.1 (Node)  →  3.3 (deps)  →  3.4 (shadcn)  →  3.5 (providers)
                                              →  3.6 (layout)
                                              →  3.7 (page)
                                              →  3.8 (health)
                                              →  3.9 (api-client)
                                              →  3.10 (gitignore)
                                              →  3.11 (eslint layer rule)
                                              →  3.12 (security headers — IF user approves)
```
- 3.5–3.10 only depend on 3.4 having committed `lib/utils.ts` (some of them do not need it but ordering is simple this way).
- 3.2 is documentation-only and can interleave anywhere.
- 3.11 must run AFTER 3.9 (rule references the file path).
- 3.12 is independent and can run anytime after 3.1.

## 5. Verification (matches Wk 1 Manual QA)

Run all of these AFTER all tasks complete:

| # | Check | Pass criterion |
|---|---|---|
| V1 | `node --version` | `v24.x.x` |
| V2 | `bun install --frozen-lockfile` | exits 0; no native-build errors. Frozen-lockfile prevents silent transitive bumps between dev machines. |
| V3 | `bun dev` | listens on `http://localhost:3000`; no warnings in stdout |
| V4 | Open `http://localhost:3000/` | empty `<main>` shell; DevTools console has 0 errors and 0 hydration warnings |
| V5 | `curl -s http://localhost:3000/api/health` | exact body `{"ok":true}`, HTTP 200 |
| V6 | View `/` in dev | floating React Query DevTools button visible bottom-corner |
| V7 | Toast smoke test (DEFAULT: console-only, no source edit) | In Chrome DevTools console on `http://localhost:3000/`, run `(await import('sonner')).toast.success('hello')` → top-right toast appears. **Use a string literal only** — never pass user-controlled HTML or JSX via `toast.custom`/`description` props (sonner renders plain strings as text, which is XSS-safe). |
| V7-fallback | Only if console-import fails | Wire `<button onClick={async () => { (await import('sonner')).toast.success('hello') }}>` in `app/page.tsx` (NOTE: handler MUST be `async () => { ... }` — `await` inside a non-async arrow does not compile). Click, then **mandatory** revert: `git diff --name-only app/page.tsx` must be empty before any commit |
| V8 | `bun run lint` | exits 0; matches the baseline captured in §3.0 (no new errors) |
| V9 | `bun audit` (or `npx --yes audit-ci --high`) | no HIGH/CRITICAL advisories. Fail closed if vulnerabilities surface. |
| V10 | Headers spot-check (only if §3.12 approved) | `curl -sI http://localhost:3000/` shows `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` |

V7 default is the console alternative — no source edit, no revert risk.

## 6. Out of scope (explicit punts — match sprint file §"Out-of-scope")

- No DB code (`lib/db/*`), no schema, no migrate/seed scripts.
- No `lib/session.ts`, no `lib/auth.ts`, no `lib/types.ts`, no `lib/format.ts`, no `lib/validators.ts`, no `lib/hooks/*`.
- No `data/seed/*.json`, no `public/seed-images/*`.
- No homepage UI beyond the empty `<main>` shell.
- No `e2e/` writes.
- No `middleware.ts` / `proxy.ts`.
- No `'use cache'` / `cacheLife` / `cacheTag`.
- No `.env.example` (Wk 6 lands `SESSION_SECRET`).
- No CSP (deferred to Wk 6 once script sources known); Wk 1 §3.12 (if approved) only adds the three baseline headers.

### Forward-look notes (set Wk 6+ up for success — NOT Wk 1 work)
- **Wk 3:** when `app/page.tsx` becomes a client grid with `useProducts`, drop the static-prerender assumption baked in by §3.7's empty shell.
- **Wk 6:** rename `cookieName: 'sec_session'` → `'__Host-sec_session'` once `secure: true` is on in prod (forbids `domain`, forces `secure` + `path=/` — strongest session-cookie binding). Land `.env.example` with `SESSION_SECRET=` placeholder + `openssl rand -base64 32` comment. Toaster lives under client boundary — server-rendered errors won't reach it pre-hydration; surface auth errors via field-level state, not toast, for SSR-rendered forms.
- **Wk 6/7/8:** `sameSite: 'lax'` does NOT protect cross-site `fetch`/form POSTs; either set `sameSite: 'strict'` for state-changing endpoints (cart/orders) OR add an `Origin`/`Referer` allowlist check in those route handlers.
- **All future sprints:** `bun audit` (V9) is the recurring sprint-exit gate.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| User has not installed Node 24 yet | 3.1 blocks until `node --version` confirmed. Surface explicitly, do not silently proceed on Node 22. |
| `better-sqlite3` native build fails on bun 1.3.11 + Node 24 | 3.3 stops + asks user to fall back to `npm install better-sqlite3`; document in README per Wk 1 QA item. |
| `bunx shadcn@latest init` overwrites `app/globals.css` Tailwind v4 setup | Read globals.css first (`app/globals.css:1-26` already has `@import "tailwindcss"` + theme vars). Confirm shadcn init merges (does not replace). If it replaces, restore the Geist `--font-sans`/`--font-mono` lines from current CSS. |
| `shadcn` writes a fresh `lib/utils.ts` that conflicts with anything we add later | We have nothing in `lib/` yet. Accept generated file as-is (sprint says default paths). |
| Toast smoke test (V7) leaks a debug button into commit | Use console alternative in V7 spec; either way, `git diff` before any commit. |
| Memory says "always confirm before installing" | 3.3 and 3.4 explicitly ASK USER. Do not bypass. |

## 8. Exit criteria (mirrors sprint §Exit criteria)

- [ ] Stack installed; `package.json` + lockfile (`bun.lockb` or `bun.lock`) updated.
- [ ] `app/providers.tsx`, `app/api/health/route.ts`, `lib/api-client.ts` committed.
- [ ] `.gitignore` updated; `data/seed/` NOT ignored, `data/app.db*` IS ignored.
- [ ] `next.config.ts` confirmed empty of `cacheComponents` key (comment-only documentation present).
- [ ] `/api/health` returns `{ok:true}` over a fresh `bun dev`, served per request (not statically cached).
- [ ] `.nvmrc` pins `24`; `engines.node` pins `>=24 <25`.
- [ ] `eslint.config.mjs` carries the `lib/api-client` layer-rule.
- [ ] (If approved) §3.12 security headers present.
- [ ] All V1–V9 checks pass (V10 only if §3.12 approved).

## 9. Review Trail

### Metis Plan Consultant
- [x] (1) `engines.node` insert validated with `node -e "require('./package.json')"` (§3.1).
- [x] (2) shadcn init: pre-backup + post-diff + Geist `@theme inline` restore block enumerated (§3.4).
- [x] (3) `layout.tsx` `<html>`/`<body>` className strings enumerated verbatim (§3.6).
- [x] (4) Toast smoke test default = console-only, no source edit (§5 V7).
- [x] (5) `lib/api-client.ts` layer-rule grep guard added (§3.9).
- [x] (6) `@types/node` bumped to `^24` alongside Node 24 pin (§3.1).
- [x] (7) Lockfile check is filename-agnostic (`bun.lockb` or `bun.lock`) (§3.3).
- [x] (8) `cacheComponents` documented in `next.config.ts` AS WELL AS sprint markdown (§3.2).
- [x] (9) `.nvmrc` trailing-newline verified via `xxd` (§3.1).
- [x] (10) Lint baseline captured in §3.0; V8 must match-or-improve.

**Metis clarifying questions — orchestrator answers:**
- Q1 (`next.config.ts` comment scope): YES — added (§3.2). Cheap insurance.
- Q2 (`@types/node@^24` in scope): YES — added (§3.1). Runtime/types must match.
- Q3 (Node version match): `>=24.0.0` accepted (any `v24.x.x`). Recorded in §3.1.

### Architect Reviewer
- [x] (1) Health route: `dynamic = 'force-dynamic'` + `Cache-Control: no-store` (§3.8). Probe runs per request.
- [x] (2) Layer-rule grep broadened to `app/api`, `lib/db`, `lib/auth.ts`, `lib/session.ts` (§3.9).
- [x] (3) ESLint `no-restricted-imports` rule encoding PLAN.md §7 layer direction (§3.11) — cheap to do now while config is empty.
- [x] (4) `Providers` documented as the only `QueryClient` site; lazy `useState` idiom confirmed correct for RSC + streaming (§3.5).
- [x] (5) Toaster placement noted as Wk 6 forward concern (server-rendered errors won't reach pre-hydration toasts) — added to forward-look notes (§6).
- [x] (6) `next.config.ts` comment kept; explicit `cacheComponents: false` left out (cleaner — no key is gospel here).
- [x] (7) shadcn post-step strengthened with `grep -c` hard gate on both Geist font bindings (§3.4).
- [x] (8) No empty `lib/db/`, `lib/hooks/` markers (YAGNI).
- [x] (9) `cn()` export verification added to §3.4.
- [x] (10) Wk 3 static-prerender removal flagged in forward-look notes (§6).
- [x] (11) No structural tech debt created.

### Security Auditor
- [x] (1) `bcryptjs` accepted; revisit cost/native impl if ever prod-bound (informational only).
- [x] (2) Audit gate `bun audit` added as V9 + recurring sprint-exit gate (§6 forward notes); §3.3 records resolved versions.
- [x] (3) `iron-session` resolved-version check added (§3.3) — pin to `^8` if drift.
- [x] (4) `trustedDependencies` review pinned: only `better-sqlite3` may be auto-added; reject blanket-trust of transitives (§3.3).
- [x] (5) `.gitignore` rewritten to use anchored `/data/app.db*` + `!/data/seed/` exception + `!.env.example` exception (§3.10).
- [x] (6) `credentials: 'include'` kept per spec; deviation to `'same-origin'` flagged for user decision in final summary (§3.9).
- [x] (7) Wk 6 CSRF posture (`sameSite: 'lax'` insufficient for cross-site fetch) added to forward-look notes (§6).
- [x] (8) `/api/health` now sets `Cache-Control: no-store` (§3.8 — also satisfies architect #1).
- [x] (9) Devtools gate left as-is (sprint-spec literal); dynamic-import optimisation noted but not adopted (YAGNI for Wk 1).
- [x] (10) V7 toast smoke test pinned to string-literal only (XSS-safe); `toast.custom`/`description` JSX prohibited (§5 V7).
- [x] (11) `bun install --frozen-lockfile` adopted in V2.
- [x] (12) `engines.node: ">=24 <25"` (closed upper bound) (§3.1).
- [x] (13) `.nvmrc` exact-minor optional — left as `24` per sprint spec.
- [x] (14) Security headers added as **OPTIONAL §3.12** with ASK USER gate; CSP deferred to Wk 6.
- [x] (15) `__Host-` cookie prefix added to Wk 6 forward-look notes.
- [x] (16) `.env.example` deferred to Wk 6 per sprint spec; `!.env.example` exception added now to prevent future ignore conflict (§3.10).

### Momus Plan Reviewer
- [x] All cited file paths and line numbers cross-checked against current source — `app/layout.tsx:26-29` / `:30`, `app/page.tsx` (65 lines, `next/image` import), `app/globals.css:1-26` (`@theme inline` 8-13), `package.json:4-5` + `@types/node@^20`, `next.config.ts` free of `cacheComponents`, all 3 pre-flight Next 16 doc paths exist.
- [x] `bun audit` and `bun pm ls --all` both confirmed valid commands.
- [x] V1–V10 verifies are binary pass/fail; spec deviations all explicitly acknowledged.
- [x] (Should-fix 1) `trustedDependencies` claim corrected — preserves existing `["sharp", "unrs-resolver"]` entries (§3.3).
- [x] (Should-fix 2) V7-fallback handler corrected to `async () => { ... }` — non-async arrow + `await` would not compile (§5).
- [x] **No must-fix blockers; plan ready to execute.**
