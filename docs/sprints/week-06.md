# Week 6 — Authentication

## Goals

Bring identity online: encrypted-cookie sessions via `iron-session`, password hashing via `bcryptjs`, register / login / logout / me endpoints, login + register pages, and a header user menu. Demo account `demo@example.com` / `Demo1234!` already seeded in Wk 2 — login page exposes the literal creds inline.

## Dependencies (from prior weeks)

- Wk 1: `iron-session`, `bcryptjs`, ky client installed.
- Wk 2: `users` table; demo user seeded; `lib/db/queries.ts` exists.
- Wk 3: `Header` component shell.

## Pre-flight reading

- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` (**`cookies()` is async**)
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (skim — we are NOT using server actions; mutations go through `useMutation` + ky)

## In-scope tasks

1. **Environment.** `.env.example` and local `.env`:
   ```
   SESSION_SECRET=<≥ 32 char random — `openssl rand -base64 32`>
   ```
   Document in README: rotating `SESSION_SECRET` invalidates every existing cookie → all users get logged out.
2. **Create `lib/session.ts`** — exact iron-session signature, no shorthand:
   ```ts
   import { getIronSession, type SessionOptions } from 'iron-session'
   import { cookies } from 'next/headers'

   export type SessionUser = { id: number; email: string; name: string }
   export type SessionData = { user?: SessionUser }

   if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
     throw new Error('SESSION_SECRET must be set and at least 32 chars')
   }

   export const sessionOptions: SessionOptions = {
     cookieName: 'sec_session',
     password: process.env.SESSION_SECRET,
     cookieOptions: {
       httpOnly: true,
       sameSite: 'lax',
       secure: process.env.NODE_ENV === 'production',
       maxAge: 60 * 60 * 24 * 7,
     },
   }

   export async function getSession() {
     return getIronSession<SessionData>(await cookies(), sessionOptions)
   }
   ```
   **`cookies()` is async** — always `await`.
3. **Create `lib/auth.ts`:**
   ```ts
   import bcrypt from 'bcryptjs'
   import { getSession, type SessionUser } from './session'

   export const hashPassword   = (pw: string) => bcrypt.hash(pw, 10)
   export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash)

   export async function ensureSession(): Promise<SessionUser> {
     const session = await getSession()
     if (!session.user) {
       throw Response.json({ error: 'unauthorized' }, { status: 401 })
     }
     return session.user
   }
   ```
   **Module direction:** `lib/auth.ts` imports `lib/session.ts`. Never the reverse. Route handlers import `lib/auth.ts`.
4. **Create `lib/validators.ts`:**
   ```ts
   export function validateEmail(v: string): string | null {
     if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Invalid email'
     return null
   }
   export function validatePassword(v: string): string | null {
     if (!v || v.length < 8)        return 'At least 8 characters'
     if (!/[A-Za-z]/.test(v))       return 'At least one letter'
     if (!/[0-9]/.test(v))          return 'At least one digit'
     return null
   }
   ```
   Wk 8 *extends* (does not recreate) this file with `validateCheckoutForm`.
5. **Add cart-helper stubs to `lib/db/queries.ts`** — bodies throw `new Error('Week 7')`. This anchors the file structure now so Wk 7 only fills in SQL.
   ```ts
   export function getOrCreateCart(userId: number): { id: number }     { throw new Error('Week 7') }
   export function listCartItems(cartId: number): CartItemView[]       { throw new Error('Week 7') }
   export function upsertCartItem(cartId: number, productId: number, qty: number): void  { throw new Error('Week 7') }
   export function updateCartItemQty(itemId: number, cartId: number, qty: number): void  { throw new Error('Week 7') }
   export function removeCartItem(itemId: number, cartId: number): void                  { throw new Error('Week 7') }
   ```
   Add `CartItemView` to `lib/types.ts`.
6. **Auth route handlers** — every one declares `export const dynamic = 'force-dynamic'`:
   - `app/api/auth/register/route.ts` (POST): JSON body `{ email, name, password }`; validate via `validateEmail` + `validatePassword`; check email uniqueness; `INSERT INTO users (email, name, password_hash)`; `session.user = { id, email, name }`; `await session.save()`; `200 { user }`.
   - `app/api/auth/login/route.ts` (POST): `{ email, password }`; lookup user; `verifyPassword`; on **any** failure return generic `401 { error: 'invalid_credentials' }` (no leak about email vs password); on success save session and return `{ user }`.
   - `app/api/auth/logout/route.ts` (POST): `await session.destroy()`; `200 { ok: true }`.
   - `app/api/auth/me/route.ts` (GET): `200 { user: session.user ?? null }` — never 401, so the header never errors.
7. **Create `lib/hooks/useMe.ts`:**
   ```ts
   export function useMe() {
     return useQuery({
       queryKey: ['me'],
       queryFn: () => api.get('auth/me').json<{ user: SessionUser | null }>(),
       staleTime: 0,
     })
   }
   ```
   **`staleTime: 0` overrides the Wk 1 global default** so post-mutation invalidation refetches immediately.
8. **Create auth mutation hooks** (`lib/hooks/useAuthMutations.ts`):
   - `useLogin`: `onSuccess` → `queryClient.setQueryData(['me'], { user })` + `invalidateQueries({ queryKey: ['cart'] })`.
   - `useRegister`: same as login.
   - `useLogout`: `onSuccess` → `setQueryData(['me'], { user: null })` + `removeQueries({ queryKey: ['cart'] })`. Drop, don't refetch (no session anyway).
   - All catch ky `HTTPError`, parse `error.response.json()` for `{error}`, re-throw `Error(message)`. `onError` calls `toast.error(error.message)`.
9. **Create `app/login/page.tsx`** (client):
   - shadcn `<Card>` with form (email, password).
   - Inline validation on blur using `validateEmail` / `validatePassword`.
   - Submit → `useLogin().mutate(...)`; pending state disables the button.
   - **Below the form, in muted text, render the demo creds literal:**
     ```tsx
     <p className="text-sm text-muted-foreground">
       Demo: <code>demo@example.com</code> / <code>Demo1234!</code>
     </p>
     ```
     Must match the Wk 2 seed exactly.
10. **Create `app/register/page.tsx`** (client) — same shape, plus a `name` field.
11. **Update `components/Header.tsx`:**
    - Use `useMe()` (becomes a client component if not already; if you'd rather keep it a server component, split off `<HeaderUserMenu />` as a client island).
    - When `me?.user` is null → render `Login` link to `/login`.
    - When set → shadcn `<DropdownMenu>` with email + Logout (calls `useLogout().mutate()`).
12. **Add shadcn primitives** if not yet — **ASK USER before running:**
    ```bash
    bunx shadcn@latest add card dropdown-menu
    ```

## Out-of-scope

- No "forgot password", no email verification (documented limitation).
- No cart endpoints — stubs only (Week 7 fills bodies).
- No checkout (Week 8).

## Manual QA checklist

- [ ] `/login` page renders; demo creds visible inline; submitting them logs in successfully (cookie `sec_session` appears in DevTools → Application → Cookies, `httpOnly`, `sameSite=lax`).
- [ ] `useMe` populates header with the logged-in email; React Query DevTools shows `['me']` cached.
- [ ] Logout button → header reverts to "Login" within one render; `['me']` cache is `{ user: null }`; `['cart']` cache is gone.
- [ ] `/register` works for a brand-new email; rejecting weak passwords (`abc`, `aaaaaaaa`, `12345678`) shows the right inline message; duplicate email shows the same generic "invalid_credentials"-style message — **no leak about which field failed**.
- [ ] `curl -s http://localhost:3000/api/auth/me` (without cookie) → `{"user":null}`, HTTP 200.
- [ ] Direct `curl -X POST http://localhost:3000/api/cart` → 401 `{"error":"unauthorized"}` (the helper works even if the body isn't built yet, because the route handler can call `await ensureSession()` and immediately error before invoking the stubbed query).
  > Note: this requires a placeholder `app/api/cart/route.ts` that just calls `ensureSession()` then throws `Error('Week 7')`. Either add it now as a stub or skip this curl line — at the team's preference. The recommended path is to **not** create the cart endpoint until Wk 7 to keep this sprint tight.
- [ ] `bun run lint` passes; no `useEffect` warnings.
- [ ] Hard refresh while logged in → still logged in (cookie survives).
- [ ] Boot the server with `SESSION_SECRET` unset → server crashes loudly with the validation error from `lib/session.ts`.

## Exit criteria

- `iron-session` cookie issued / cleared by the four auth endpoints.
- `useMe` available everywhere; mutation hooks correctly poke the query cache on success.
- Login page exposes the demo creds literal that matches the seed.
- `lib/db/queries.ts` carries cart-stub function signatures that Wk 7 will fill.
- `validators.ts` covers email + password, ready for extension in Wk 8.

## Transition to Week 7

Identity is solid. Week 7 fills in the cart query bodies (single-`JOIN` for `listCartItems`, transactional `upsertCartItem`), exposes the cart endpoints (`GET /api/cart`, `POST /api/cart/items`, `PATCH/DELETE /api/cart/items/[id]`), wires the `useCart` hook + mutation hooks, and replaces the Wk 5 placeholder `AddToCartButton` body. Same `{ productId, stock }` props — only the click handler changes. A shadcn `<Sheet>`-based `CartDrawer` opens from the header cart icon.
