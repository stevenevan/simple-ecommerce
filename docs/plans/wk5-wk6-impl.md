# Implementation Plan — Week 5 (Product Detail) + Week 6 (Auth)

Source-of-truth sprints: `docs/sprints/week-05.md`, `docs/sprints/week-06.md`.
This plan flattens both sprints into discrete, sequenced, file-level tasks with verification per phase. Each phase ends in a single `/caveman-commit`-style conventional commit.

---

## 1. Context

Repo state (verified):
- Branch `main`, clean tree. Last commit `ea70b14` (default-category sentinel).
- Wk 1–4 complete: shadcn primitives `aspect-ratio button badge card field input label select separator skeleton` already installed; `lib/schemas/auth.ts` already exposes `loginSchema`/`registerSchema`/`sessionUserSchema`; `lib/db/queries.ts` has `listProducts/getProductBySlug/listCategories`; `app/api/products` + `app/api/health` exist; `Header` is a server component shell with a `header-right` slot.
- DB schema (Wk 2) already has `users/products/carts/cart_items/orders/order_items` with FKs + indexes.
- Demo user already seeded: `demo@example.com` / `Demo1234!` (verified in `lib/db/seed.ts`).
- `bcryptjs`, `iron-session`, `ky`, `@tanstack/react-form`, `zod`, `sonner` already installed (verified `package.json`).

Out-of-scope confirmation:
- No real cart endpoints (Wk 7).
- No checkout (Wk 8).
- No middleware/proxy.ts.
- No `'use cache'` / `cacheLife` (model is forced-dynamic + force-dynamic route handlers).

---

## 2. Phase Boundaries (one commit per phase)

| Phase | Scope | Commit type |
|---|---|---|
| **5A** | shadcn `tabs` install + Wk5 detail page server component, loading, not-found, ProductImage, ProductSpecs, AddToCartButton placeholder. | `feat(product)` |
| **6A** | env + `lib/session.ts` + `lib/auth.ts` + cart-helper stubs in `lib/db/queries.ts` + `CartItemView` type. | `feat(auth)` |
| **6B** | Auth route handlers: `register`, `login`, `logout`, `me` with body-cap + dummy-hash timing equalization. | `feat(api)` |
| **6C** | shadcn `card dropdown-menu` install + `useMe` + auth mutation hooks + login + register pages + Header user-menu split. | `feat(auth)` |

Phase order is strict: 5A → 6A → 6B → 6C. 6A's `ensureSession` is consumed by 6B; 6B's endpoints are consumed by 6C's hooks.

---

## 3. Phase 5A — Product Detail Page

### 3.1 Pre-flight

- `bunx shadcn@latest add tabs` — **ASK USER FIRST** (per project rule). If user declines or wants plain stacked sections, skip the install and the `<Tabs>` import; render description + specs as stacked sections.
- Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` to confirm async `params` signature.

### 3.2 Files to create

| Path | Kind | Notes |
|---|---|---|
| `app/products/[slug]/page.tsx` | server | `export const dynamic = 'force-dynamic'`; `params: Promise<{slug:string}>`; `await params`; `getProductBySlug` → `notFound()` if null. |
| `app/products/[slug]/loading.tsx` | server | Skeleton: square image block + four `<Skeleton>` lines. |
| `app/products/[slug]/not-found.tsx` | server | "Product not found" message + shadcn `<Button asChild><Link href="/">Back to all products</Link></Button>`. |
| `app/products/[slug]/ProductDetail.tsx` | server | **Page-local** (per AGENTS.md convention — lives next to `page.tsx`, never promote to `components/`). Two-column responsive layout (`grid md:grid-cols-2 gap-8`). Image left, specs+button right. Optional `<Tabs>` for Description/Specs split. |
| `components/ProductImage.tsx` | server, **reusable** (likely re-used on cart/order-summary later). Wraps `next/image`, `width=800 height=800`, `priority`, uses `safeProductImage(product.image_url)` (already exists in `lib/image.ts`). **`alt={product.name}`** — never empty. |
| `components/ProductSpecs.tsx` | server, **reusable**. h1 name, `<Badge>` category, `formatCurrency(price_cents)`, description paragraph, stock indicator. |
| `components/AddToCartButton.tsx` | client island | `'use client'`. Props **frozen as `{ productId: number; stock: number }`**. Uses `sonner` toast + `useRouter` for "Sign in" action. Imports `Button`, `toast`, `useRouter`. |

### 3.3 Locked behaviors

- `AddToCartButton` props signature `{ productId, stock }` — Wk 7 swaps body only.
- Page is **public**: no `ensureSession` call. Unauth handled inside the button.
- `ProductImage` uses `safeProductImage`; never trusts raw `product.image_url`.
- No `useQuery` for the product itself — server component reads SQLite directly.

### 3.4 Phase 5A QA

- `/products/<seeded-slug>` renders; image/name/price/description/stock all visible.
- View Source contains formatted price (`$xx.xx`) — proves SSR.
- `/products/does-not-exist` → custom `not-found.tsx`, not framework default.
- Slow 3G throttle → `loading.tsx` skeleton flashes (manual / browser-DevTools-only). Machine-executable fallback: `curl -s http://localhost:3000/products/<seeded-slug>` → `200`, non-empty body. Skeleton flash is informational.
- `Add to cart` → sonner toast with "Sign in" action that pushes `/login` (route 404 expected pre-6C).
- Manually `UPDATE products SET stock=0 WHERE id=1` → button reads "Out of stock" + `disabled`. Reset stock after.
- No console errors / no hydration warnings.
- `bun run lint` and `bun run type:check` pass.

### 3.5 Phase 5A commit

`feat(product): server-rendered detail page + AddToCart island`

---

## 4. Phase 6A — Session + Auth Library + Cart Stubs

### 4.1 Files

| Path | Kind | Notes |
|---|---|---|
| `.env.example` (new) | env | `SESSION_SECRET=` + comment. |
| `.env` (local; gitignored) | env | **Agent does NOT write `.env`.** Plan only writes `.env.example`. ASK USER to populate `.env` themselves with `SESSION_SECRET=$(openssl rand -base64 32)`. QA blocks until the user confirms `.env` is populated. (`.gitignore` line 34 already covers `.env*`; line 54 keeps `.env.example` committable. Verified.) |
| `lib/session.ts` | server | Exports `SessionUser`, `SessionData`, `sessionOptions`, `getSession`. **Throws at module load if `SESSION_SECRET` missing or `<32` chars.** `cookies()` is `await`ed inside `getSession`. `sessionOptions.cookieOptions`: `{ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60*60*24*7 }`. **No `domain`** (host-only stricter — no subdomain leak). |
| `lib/auth.ts` | server | Exports `hashPassword` (async — `bcrypt.hash`), `verifyPassword` (async — `bcrypt.compare`; **NEVER `compareSync`** — sync blocks event loop and breaks timing-equalization), and `ensureSession(): Promise<SessionUser \| Response>` (return-union, NOT throw — see §7 Risk 1). Imports `lib/session.ts`. **Module direction `lib/auth.ts → lib/session.ts`, never reverse.** |
| `lib/db/queries.ts` | server (edit) | Append five cart-helper stubs that throw `new Error('Week 7')`: `getOrCreateCart/listCartItems/upsertCartItem/updateCartItemQty/removeCartItem`. Add `import type { CartItemView } from '@/lib/types'` (alias path; matches codebase convention). |
| `lib/types.ts` | shared (edit) | Append the **full Wk 7 `CartItemView` shape** now (no placeholder hedge): `{ id: number; productId: number; slug: string; name: string; image_url: string; price_cents: number; quantity: number; line_total_cents: number; stock: number }`. Stubs throw at runtime so SQL is not needed, but the type must be complete to avoid Wk 7 type-check failure. **Do not import `@/lib/db/**` here.** |
| `README.md` | docs (edit) | Add a 3-line "Auth secret" section: how to generate `SESSION_SECRET`, and that rotating it invalidates cookies. |

### 4.2 Locked behaviors

- `cookies()` is `await`ed (Next 16 async cookies).
- `sessionOptions` exact shape (per sprint 6 spec lines 38–47).
- `lib/auth.ts` consumes `lib/session.ts` only. Never the inverse.
- Cart stubs anchor signatures so Wk 7 only fills SQL.

### 4.3 Phase 6A QA

- `bun run type:check` passes.
- Boot dev server with `SESSION_SECRET` unset: `SESSION_SECRET= bun run dev` → server throws loudly with "SESSION_SECRET must be set and at least 32 chars" before serving any request.
- Boot with `SESSION_SECRET` set → server starts; `lib/session.ts` does NOT crash.
- Importing `getOrCreateCart` from a node REPL → calling it throws `Error('Week 7')`.

### 4.4 Phase 6A commit

`feat(auth): iron-session + ensureSession + cart stubs`

---

## 5. Phase 6B — Auth Route Handlers

### 5.1 Files

| Path | Notes |
|---|---|
| `app/api/auth/register/route.ts` | POST. `dynamic='force-dynamic'`. Body cap: read `req.headers.get('content-length')` **before** calling `req.json()`; if `Number(len) > 10_000` → `413 payload_too_large`. (Known limitation: requests with no `content-length` or `Transfer-Encoding: chunked` bypass the header check — acceptable for demo. Document inline.) Operation order (locked):<br>`(1)` parse body (10 KB cap)<br>`(2)` `registerSchema.safeParse` → `400 invalid_form` with `z.flattenError(err).fieldErrors` (no DB touched)<br>`(3)` `await hashPassword(password)` *(always — runs even on duplicate path so wall-clock matches success path)*<br>`(4)` `getUserByEmail` → if duplicate, `401 { error: 'invalid_credentials' }` (literal — same shape/body as login 401, no field hints, no `email_taken` code)<br>`(5)` `INSERT INTO users (email, password_hash, name)`<br>`(6)` set `session.user`, `await session.save()`<br>`(7)` `200 { user }`<br>All responses include `Cache-Control: no-store`. |
| `app/api/auth/login/route.ts` | POST. Same body-cap + schema pattern. Module-level `DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)`. **Single code path** (no per-branch early return) for timing equalization:<br>`(a)` `const user = getUserByEmail(email)`<br>`(b)` `const hash = user?.password_hash ?? DUMMY_HASH`<br>`(c)` `const ok = await bcrypt.compare(password, hash)` *(always `await`, always run; NEVER `compareSync`)*<br>`(d)` `if (!user || !ok) return Response.json({ error: 'invalid_credentials' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })`<br>On success: set `session.user`, `await session.save()`, `200 { user }` with `Cache-Control: no-store`. |
| `app/api/auth/logout/route.ts` | POST. No body parsing. `await session.destroy()` → `200 { ok: true }` with `Cache-Control: no-store`. |
| `app/api/auth/me/route.ts` | GET. **Never 401.** `200 { user: session.user ?? null }` with `Cache-Control: no-store` (matches `useMe` `staleTime: 0` — client + server agree on freshness). Iron-session decode failures (tampered/garbage cookie) are swallowed by default → also returns `{user: null}`. |
| `lib/db/queries.ts` (edit) | Add `getUserByEmail` and `insertUser` helpers (parameterized, return Row | null). |

### 5.2 Locked behaviors

- Two distinct rejection paths: schema-shape `400 invalid_form` vs business-rule `401 invalid_credentials`. **Never collapse**.
- 10 KB body cap before JSON parse on every POST.
- Schema-parse 400 path **never touches DB** (cannot leak email existence).
- `auth/me` always 200 (header never errors).
- All routes export `dynamic='force-dynamic'`.
- All auth route responses (register/login/logout/me) include `Cache-Control: no-store`. Prevents intermediary/browser caching of `Set-Cookie` and `{user}` payloads.
- **Register-duplicate response is byte-identical to login-mismatch 401**: `{ error: 'invalid_credentials' }`, status `401`, no `fields` key, no `email_taken` code. Any deviation leaks user existence via response-shape diff. (Sprint's user-enumeration QA item: "duplicate email shows the same generic invalid_credentials-style message — no leak about which field failed".)
- Register hashes the password BEFORE the uniqueness branch decision so duplicate-path wall-clock matches success path (no timing leak via "instant 401" on duplicate).
- **No `console.log` of request bodies, user records, password fields, or cookies** anywhere in auth routes. Auth routes are highest-PII surface — any debug log is a leak.

### 5.3 Phase 6B QA

- `time curl -sX POST … login` with valid email + wrong password vs unknown email + wrong password → both `401 invalid_credentials`, wall-clock within ~10–15 ms.
- `curl -sX POST register` with `content-length: 100000` and body to match → `413 payload_too_large`.
- `curl -sX POST register -d '{"email":"x","name":"","password":"a"}'` → `400 { error: 'invalid_form', fields: { email:[...], name:[...], password:[...] } }`.
- `curl -s /api/auth/me` (no cookie) → `{"user":null}` HTTP 200.
- `curl -s -H 'cookie: sec_session=garbage_or_tampered_value' /api/auth/me` → `{"user":null}` HTTP 200 (NOT 500). Confirms iron-session decode-failure is swallowed.
- All four auth route responses include `Cache-Control: no-store` (verify with `curl -i`).
- POST `register` with valid new payload → 200, `Set-Cookie: sec_session=...; HttpOnly; SameSite=Lax`.
- POST `login` with `demo@example.com` / `Demo1234!` → 200, cookie issued.
- POST `logout` with cookie → 200, cookie cleared.
- `bun run lint` + `bun run type:check`.

### 5.4 Phase 6B commit

`feat(api): auth routes w/ timing-safe login`

---

## 6. Phase 6C — Hooks + Pages + Header Wiring

### 6.1 Pre-flight

- `card` already present (verified `components/ui/card.tsx` exists). Only `dropdown-menu` needs installing.
- `bunx shadcn@latest add dropdown-menu` — **ASK USER FIRST**.

### 6.2 Files

| Path | Notes |
|---|---|
| `lib/hooks/useMe.ts` | `useQuery(['me'], () => api.get('auth/me').json<{user: SessionUser \| null}>(), { staleTime: 0 })`. **`staleTime: 0` overrides Wk 1 global**. Document inline: load-bearing (header depends). **Client code imports `SessionUserParsed as SessionUser` from `@/lib/schemas/auth`** (server-only `lib/session.ts` cannot reach client bundles). Server code uses `SessionUser` from `lib/session.ts`. The two types are structurally identical — note inline so implementers do not try to reconcile/dedupe them. **`api.get('auth/me')` (NO leading slash, NO `/api/` prefix)** — the ky client at `lib/api-client.ts` already sets `prefix: '/api'`; `api.get('/api/auth/me')` resolves to `/api/api/auth/me` → 404. |
| `lib/hooks/useAuthMutations.ts` | `useLogin`, `useRegister`, `useLogout`. ky calls. `onSuccess` cache pokes per sprint spec line 142–144. `onError` parses ky `HTTPError` → `error.response.json()` → re-throws `Error(message)` → toast. **`useLogout.onError`**: even when the server 5xx's, still call `setQueryData(['me'], { user: null })` + `removeQueries({ queryKey: ['cart'] })` so a server hiccup cannot strand the user in a "logged-in UI, no cookie" state. Toast the error, but don't preserve auth UI state. |
| `app/login/page.tsx` | `'use client'`. TanStack Form + `loginSchema` + shadcn `Field`. Wraps form in `<Card>`. **Demo creds rendered literal** (`demo@example.com` / `Demo1234!`) below form. **Sibling `app/login/layout.tsx`** exports `metadata = { robots: { index: false, follow: false } }` (page itself is `'use client'`, so metadata must live on a server-component layout). |
| `app/register/layout.tsx` | server | Exports `metadata = { robots: { index: false, follow: false } }` for the same reason. |
| `app/login/HeaderUserMenu.tsx` *(client island)* OR `components/HeaderUserMenu.tsx` — pick the latter since the header is global, not page-local (per AGENTS.md convention: page-local islands live under `app/<route>/`; reusable domain components live in `components/`). Decision: **`components/HeaderUserMenu.tsx`**. | `'use client'`. Calls `useMe()`. Null user → `<Link href="/login">Login</Link>`. Set user → shadcn `<DropdownMenu>` with email + Logout (`useLogout().mutate()`). |
| `app/register/page.tsx` | `'use client'`. Same pattern as login but `registerSchema` and a third `name` field. **No demo-creds block on register.** |
| `components/Header.tsx` (edit) | Stay a server component. Replace the empty `<div data-slot="header-right" />` with `<HeaderUserMenu />` (client island). |

### 6.3 Locked behaviors

- Schemas `validators.onChange`; errors *displayed* only when `isTouched && !isValid`.
- `<FieldError errors={field.state.meta.errors} />` consumes the array directly. Pass `field.state.meta.errors` **as-is** — do NOT `.map(e => e.message)` first. shadcn `FieldError` accepts `Array<{ message?: string } | undefined>` (matches TanStack Form v1 / React 19 shape).
- Forms call `e.preventDefault(); e.stopPropagation(); form.handleSubmit()` in `onSubmit`.
- `useMe` `staleTime: 0` (per sprint emphasis).
- `useLogin/useRegister`: `setQueryData(['me'], { user })` + `invalidateQueries(['cart'])`.
- `useLogout`: `setQueryData(['me'], { user: null })` + `removeQueries(['cart'])`. Drop, do not refetch.

### 6.4 Phase 6C QA

- `/login` page renders. Demo creds visible inline. Submit demo creds → cookie `sec_session` (HttpOnly, SameSite=lax, NOT secure in dev) appears; header shows email.
- React Query DevTools shows `['me']` cached.
- Logout button → header reverts to "Login" within one render; `['me']` cache `{user:null}`; `['cart']` removed.
- `/register` works for a fresh email; weak passwords (`abc`, `aaaaaaaa`, `12345678`) show inline `<FieldError>` (`aaaaaaaa` → "At least one digit"); duplicate email → generic message, **no field leak**.
- Touched-state UX: typing one char + blur → "Invalid email"; continuing typing valid email → error clears as soon as valid.
- Hard reload while logged in → still logged in.
- `bun run lint` + `bun run type:check`.

### 6.5 Phase 6C commit

`feat(auth): login/register pages + header user menu`

---

## 7. Risks / Open Questions (resolve before implementing)

1. **`ensureSession` signature — locked to return-union, not throw.** Architect review confirmed Next 16 has no documented contract for propagating a thrown bare `Response` from a route handler (only `redirect/notFound/forbidden/unauthorized` use throw-as-control-flow, all routed through `unstable_rethrow`; see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md`). A non-Next throw becomes a 500. **Decision**: `ensureSession(): Promise<SessionUser | Response>`. Callers do:
   ```ts
   const u = await ensureSession()
   if (u instanceof Response) return u
   ```
   Applies to **every consumer**, including Wk 7 cart route handlers — propagate everywhere.
2. **`SessionUser` import path from client code.** Resolved above: use `SessionUserParsed` from `lib/schemas/auth.ts`. Confirmed `lib/schemas/**` is shared client/server (AGENTS.md rule).
3. **Sprint 6 QA last item asks to test `app/api/cart` returning 401.** Sprint 6 itself notes this is optional (recommended path: skip, defer to Wk 7). **Decision: skip the cart route stub.** No `app/api/cart/route.ts` in this plan.
4. **`.env` file ownership — RESOLVED.** Verified `.gitignore` line 34 (`.env*`) covers `.env`; line 54 (`!.env.example`) keeps the example committable. **Decision: agent writes `.env.example` only; never writes `.env`.** Pre-flight blocker: ASK USER to run `openssl rand -base64 32 > /dev/null` and populate `.env` with `SESSION_SECRET=...` before 6A QA. No agent-generated secret on disk.
5. **Tabs primitive.** Sprint says install `tabs`; spec also says "otherwise plain stacked sections". **Decision: ASK USER. Default fallback if declined: stacked sections (no `tabs` install).**

---

## 8. Implementation Order Checklist

```
[ ] Phase 5A: ASK install tabs → write 7 files → manual QA → caveman-commit
[ ] Phase 6A pre-flight: ASK user to populate .env (no agent-written secret)
[ ] Phase 6A: write .env.example → write session.ts + auth.ts (return-union ensureSession) → edit queries.ts + types.ts → README note → manual QA → caveman-commit
[ ] Phase 6B: write 4 route handlers → manual QA (curl matrix incl. tampered-cookie + Cache-Control assertion) → caveman-commit
[ ] Phase 6C: ASK install dropdown-menu → write hooks + 2 pages + 2 layouts (robots metadata) + HeaderUserMenu → edit Header → manual QA → caveman-commit
```

§7 Risk 1 already locks the return-union pattern (architect-verified), so no per-doc reading step remains.

Each phase commit is conventional + caveman-style: `<type>(<scope>): <terse imperative ≤50 chars>`. Body only when "why" non-obvious.

---

## 9. Review Trail

### Metis Plan Consultant
- [x] D1 — Document `FieldError` accepts `field.state.meta.errors` as-is (no `.map`).
- [x] D2 — Strike duplicate `SessionUser` re-export wording; client uses `SessionUserParsed`, server uses `lib/session.ts`.
- [x] D3 — `CartItemView` written to full Wk 7 shape now (no placeholder).
- [x] D4 — Note ky `prefix:'/api'` so hooks call `'auth/me'` not `'/api/auth/me'`.
- [x] D5 — Risk 1 fallback applies to every consumer (incl. Wk 7).
- [x] D6 — `content-length` checked before `req.json()`; chunked-transfer caveat noted.
- [x] D7 — Pre-flight 6C: only `dropdown-menu` install (`card` already present).
- [x] D8 — `SESSION_SECRET` guard QA has explicit `SESSION_SECRET= bun run dev`.
- [x] D9 — Slow 3G QA flagged manual; curl-200 fallback added.
- [x] D10 — Checklist item rewritten to "read error-handling doc + record decision".

### Security Auditor
- [x] S1 — `path: '/'` pinned in `sessionOptions`.
- [x] S2 — `secure: NODE_ENV==='production'` pinned in locked behavior.
- [x] S3 — login dummy-hash branch rewritten as single ordered list (no per-branch early return).
- [x] S4 — register dup response pinned literal: `{error:'invalid_credentials'}`, status 401, byte-identical to login 401.
- [x] S5 — register operation order locked: parse → schema → hash → uniqueness → insert → save (hash before branch).
- [x] S6 — `Cache-Control: no-store` on all four auth routes.
- [x] S7 — `useMe` `staleTime: 0` rationale + matching `no-store` on `/api/auth/me`.
- [x] S8 — Robots metadata via `app/login/layout.tsx` + `app/register/layout.tsx`.
- [x] S9 — `ProductImage` pinned `alt={product.name}`.
- [x] S10 — "No console.log of bodies/users/cookies in auth routes" locked.
- [x] S11 — `verifyPassword` async (`bcrypt.compare`); `compareSync` forbidden.
- [x] S12 — `.gitignore` verified covers `.env`; agent never writes `.env`. Risk 4 marked RESOLVED.
- [x] S13 — Tampered-cookie QA negative test added.
- [x] S14 — `useLogout.onError` still clears `['me']` + drops `['cart']`.

### Architect Reviewer
- [x] A1 — Risk 1 doc citation fixed (`route.md` + `unstable_rethrow.md`).
- [x] A2 — Return-union `ensureSession()` locked up-front; `throw Response` rejected.
- [x] A3 — `lib/auth.ts` row signature updated to return-union + async-only `verifyPassword`.
- [x] A4 — `CartItemView` import switched to `@/lib/types` alias path.
- [x] A5 — `useMe.ts` row carries explicit client/server `SessionUser` split rationale.
- [x] A6 — `.env` row narrowed: agent only writes `.env.example`; `.env` is user-owned.
- [x] A7 — `ProductDetail.tsx` flagged page-local; `ProductImage`/`ProductSpecs` flagged reusable.
- [x] A8 — User-enumeration tradeoff surfaced as its own bullet in §5.2 locked behaviors.
- [x] A9 — No new abstractions introduced (architect confirmed plan correctly avoids over-engineering).
- [x] A10 — Cross-phase coupling noted sound by architect.

### Momus Plan Reviewer
- [x] All claimed files verified (`lib/schemas/auth.ts` exports `SessionUserParsed`; `lib/api-client.ts` has `prefix: '/api'`; `components/Header.tsx` has `header-right` slot; demo creds seeded).
- [x] Cited Next 16 docs verified to exist (`route.md`, `unstable_rethrow.md`, `dynamic-routes.md`).
- [x] shadcn `FieldError` accepts `field.state.meta.errors` as-is (verified `components/ui/field.tsx:176-194`).
- [x] All four phases have concrete runnable QA.
- [x] Locked behaviors and file tables internally consistent.
- [x] **GREEN LIGHT — proceed with 5A → 6A → 6B → 6C in order.**
