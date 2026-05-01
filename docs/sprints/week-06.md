# Week 6 — Authentication

## Goals

Bring identity online: encrypted-cookie sessions via `iron-session`, password hashing via `bcryptjs`, register / login / logout / me endpoints, login + register pages, and a header user menu. Demo account `demo@example.com` / `Demo1234!` already seeded in Wk 2 — login page exposes the literal creds inline. Forms use TanStack Form + zod schemas from `lib/schemas/auth.ts` + shadcn `Field` primitives (per Week 4.5).

## Dependencies (from prior weeks)

- Wk 1: `iron-session`, `bcryptjs`, ky client installed.
- Wk 2: `users` table; demo user seeded; `lib/db/queries.ts` exists.
- Wk 3: `Header` component shell.
- Wk 4.5: `zod`, `@tanstack/react-form`, shadcn `Field` installed; `lib/schemas/auth.ts` exposes `loginSchema` + `registerSchema`.

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
4. **Validation rules live in `lib/schemas/auth.ts`** (created Wk 4.5). No `lib/validators.ts` file. Server route handlers below import `loginSchema` / `registerSchema` and `safeParse` the request body before any DB work. Wk 8 likewise consumes `lib/schemas/checkout.ts` — already in place from Wk 4.5.
5. **Add cart-helper stubs to `lib/db/queries.ts`** — bodies throw `new Error('Week 7')`. This anchors the file structure now so Wk 7 only fills in SQL.
   ```ts
   export function getOrCreateCart(userId: number): { id: number }     { throw new Error('Week 7') }
   export function listCartItems(cartId: number): CartItemView[]       { throw new Error('Week 7') }
   export function upsertCartItem(cartId: number, productId: number, qty: number): void  { throw new Error('Week 7') }
   export function updateCartItemQty(itemId: number, cartId: number, qty: number): void  { throw new Error('Week 7') }
   export function removeCartItem(itemId: number, cartId: number): void                  { throw new Error('Week 7') }
   ```
   Add `CartItemView` to `lib/types.ts`.
6. **Auth route handlers** — every one declares `export const dynamic = 'force-dynamic'`. All POST routes enforce a 10 KB body cap before parsing JSON (defeats DoS via giant payloads).

   Two distinct rejection paths — never collapse them:

   | Path | Status | Body | Concern |
   |---|---|---|---|
   | Schema parse fail (shape) | 400 | `{ error: 'invalid_form', fields: z.flattenError(err).fieldErrors }` | Form UX wants per-field errors |
   | Business-rule fail (creds) | 401 | `{ error: 'invalid_credentials' }` (no `fields`) | User-enumeration prevention |

   - `app/api/auth/register/route.ts` (POST):
     ```ts
     import { z } from 'zod'
     import { registerSchema } from '@/lib/schemas/auth'

     const MAX_BODY_BYTES = 10_000

     export async function POST(req: NextRequest) {
       const len = Number(req.headers.get('content-length') ?? 0)
       if (len > MAX_BODY_BYTES) return Response.json({ error: 'payload_too_large' }, { status: 413 })

       const json = await req.json().catch(() => null)
       const parsed = registerSchema.safeParse(json)
       if (!parsed.success) {
         return Response.json(
           { error: 'invalid_form', fields: z.flattenError(parsed.error).fieldErrors },
           { status: 400 },
         )
       }
       const { email, name, password } = parsed.data
       // uniqueness check + INSERT INTO users + session.user = ... + await session.save()
       // 200 { user }
     }
     ```
   - `app/api/auth/login/route.ts` (POST): same shape with `loginSchema`. **Constant-time equalization** to defeat user-enumeration via timing — even on user-miss, run a bcrypt compare against a module-level dummy hash so wall-clock time is comparable to the known-email branch:
     ```ts
     import bcrypt from 'bcryptjs'
     const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)
     // …
     const user = getUserByEmail(email)
     const ok = user
       ? await bcrypt.compare(password, user.password_hash)
       : (await bcrypt.compare(password, DUMMY_HASH), false)
     if (!ok || !user) return Response.json({ error: 'invalid_credentials' }, { status: 401 })
     ```
     The schema-parse 400 path never consults the DB, so it cannot leak email existence. Once the body shape is valid, the only public response is the generic 401.
   - `app/api/auth/logout/route.ts` (POST): `await session.destroy()`; `200 { ok: true }`. No body parsing.
   - `app/api/auth/me/route.ts` (GET): `200 { user: session.user ?? null }` — never 401, so the header never errors.

   **Boundary recap:** the schema says *what shape is valid*; the route says *what credentials are allowed*. Shape-validation 400 vs. business-rule 4xx are independent — never collapse a credential failure into `invalid_form`.
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
9. **Create `app/login/page.tsx`** (`'use client'` — `useForm` is a client hook). Pattern source-of-truth: shadcn `/docs/forms/tanstack-form`.
   ```tsx
   'use client'
   import { useForm } from '@tanstack/react-form'
   import { loginSchema, type LoginInput } from '@/lib/schemas/auth'
   import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
   import { Input } from '@/components/ui/input'
   import { Button } from '@/components/ui/button'
   import { useLogin } from '@/lib/hooks/useAuthMutations'

   export default function LoginPage() {
     const login = useLogin()
     const form = useForm({
       defaultValues: { email: '', password: '' } satisfies LoginInput,
       validators: { onChange: loginSchema },
       onSubmit: async ({ value }) => { await login.mutateAsync(value) },
     })
     return (
       <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit() }}>
         <FieldGroup>
           <form.Field
             name="email"
             children={(field) => {
               const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
               return (
                 <Field data-invalid={isInvalid}>
                   <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                   <Input
                     id={field.name} name={field.name} type="email" autoComplete="email"
                     value={field.state.value}
                     onBlur={field.handleBlur}
                     onChange={(e) => field.handleChange(e.target.value)}
                     aria-invalid={isInvalid}
                   />
                   {isInvalid && <FieldError errors={field.state.meta.errors} />}
                 </Field>
               )
             }}
           />
           {/* repeat for password (type="password", autoComplete="current-password") */}
           <form.Subscribe
             selector={(s) => [s.canSubmit, s.isSubmitting] as const}
             children={([canSubmit, isSubmitting]) => (
               <Button type="submit" disabled={!canSubmit || isSubmitting}>
                 {isSubmitting ? 'Signing in…' : 'Sign in'}
               </Button>
             )}
           />
         </FieldGroup>
       </form>
     )
   }
   ```
   - Wrap the form in shadcn `<Card>` for visual.
   - Errors are *computed* on every change (per `validators.onChange`); they are *displayed* only after the field is touched (`isTouched && !isValid`). `<FieldError errors={...}>` consumes the array directly — do NOT hand-render `<p>{errors.join(', ')}</p>`.
   - **Below the form, in muted text, render the demo creds literal:**
     ```tsx
     <p className="text-sm text-muted-foreground">
       Demo: <code>demo@example.com</code> / <code>Demo1234!</code>
     </p>
     ```
     Must match the Wk 2 seed exactly.
10. **Create `app/register/page.tsx`** (`'use client'`) — same pattern with `registerSchema` and a third `name` field.
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
- [ ] `/register` works for a brand-new email; rejecting weak passwords (`abc`, `aaaaaaaa`, `12345678`) shows the right inline message via `<FieldError>` (e.g. `aaaaaaaa` → "At least one digit"); duplicate email shows the same generic "invalid_credentials"-style message — **no leak about which field failed**.
- [ ] Open `/login` for the first time → no `<FieldError>` rendered (untouched). Type one char in email and blur → field is touched + invalid; "Invalid email" appears immediately. Continue typing a valid email → error clears on the change that makes it valid.
- [ ] **Login timing parity (security).** Run `time curl -sX POST http://localhost:3000/api/auth/login -H content-type:application/json -d '{"email":"demo@example.com","password":"WRONG_pass1"}'` AND `time curl -sX POST … -d '{"email":"unknown-${RANDOM}@example.com","password":"WRONG_pass1"}'`. Both must return `401 invalid_credentials` AND wall-clock times within ~10–15 ms of each other. Conspicuously faster unknown-email response means the `DUMMY_HASH` equalization is missing or broken.
- [ ] **Body-size cap.** `curl -sX POST http://localhost:3000/api/auth/register -H content-type:application/json -H 'content-length: 100000' --data-binary "$(node -e 'process.stdout.write("{}".padEnd(100000))')"` → `413 payload_too_large`.
- [ ] **Server schema parse.** `curl -sX POST http://localhost:3000/api/auth/register -H content-type:application/json -d '{"email":"x","name":"","password":"a"}'` → `400 { error: 'invalid_form', fields: { email:[...], name:[...], password:[...] } }`.
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
- `lib/schemas/auth.ts` is the single source of truth for login/register rules; same schemas run client-side (TanStack Form `validators`) and server-side (route handler `safeParse`).

## Transition to Week 7

Identity is solid. Week 7 fills in the cart query bodies (single-`JOIN` for `listCartItems`, transactional `upsertCartItem`), exposes the cart endpoints (`GET /api/cart`, `POST /api/cart/items`, `PATCH/DELETE /api/cart/items/[id]`), wires the `useCart` hook + mutation hooks, and replaces the Wk 5 placeholder `AddToCartButton` body. Same `{ productId, stock }` props — only the click handler changes. A shadcn `<Sheet>`-based `CartDrawer` opens from the header cart icon. Wk 8's checkout form will consume `lib/schemas/checkout.ts` (already in place from Wk 4.5) using the same TanStack Form pattern.
