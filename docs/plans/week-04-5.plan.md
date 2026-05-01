# Week 4.5 Plan — Forms Foundation (zod + TanStack Form + shadcn `Field`)

> **Status:** Planning. Inserted *between* Week 4 (filters shipped) and Week 5 (product detail).
> **Reason for inserting now:** Week 6 (auth login/register) and Week 8 (checkout) ship the first real forms in the app. Replacing the previously-planned hand-rolled validators + plain `<input>`/`<Label>` pattern with zod + TanStack Form + shadcn `Field` BEFORE those sprints write code prevents two rewrites later. Week 4.5 ships **zero user-visible features** — it is pure foundation + scope changes to downstream un-run sprints (6, 8).

---

## 1. Context

The original 8-sprint plan locked in:

- `PLAN.md` §2: *"No third-party libs in checkout (form validation hand-rolled)."*
- Week 6: `lib/validators.ts` with regex-based `validateEmail` / `validatePassword`.
- Week 8: extends `lib/validators.ts` with `validateCheckoutForm`, plain React state + manual error map, plain shadcn `<Input>` + `<Label>`.

User is overriding that constraint. New direction:

- **zod is the single source of truth for shape + rules.** Same schemas validate (a) form input on the client, (b) request bodies on the server, (c) (optionally) parsed API responses.
- **TanStack Form** drives the form state machine on the client (touched / dirty / submitting / errors) and consumes zod schemas via the Standard Schema spec.
- **shadcn `Field` family** (`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldSeparator`) replaces ad-hoc label + input + error-text markup everywhere a form is rendered.

The change is scoped to Week 4.5 + retroactive edits to Week 6 + Week 8 docs. Weeks 1–4 (already shipped) and Weeks 5, 7 (no forms) are not touched.

---

## 2. Constraints (do not violate)

- Project is **Next 16.2.4 / React 19.2 / Tailwind v4 / shadcn `base-nova`** — not the React 18 / RHF world. Read `node_modules/next/dist/docs/...` before any Next-specific code.
- TanStack Form **v1.x** (Standard Schema support requires v1+). zod **v3.24.0+** for native Standard Schema.
- shadcn `Field` registry component lives at `components/ui/field.tsx` after install. **Do not hand-write it.** Use `bunx shadcn@latest add field`.
- Keep `lib/types.ts`, `lib/hooks/**`, `components/**` free of `@/lib/db/**` imports (per `AGENTS.md`). Zod schemas that mirror DB shapes live in `lib/schemas/` and **must** be importable from both client and server — therefore must not transitively pull `better-sqlite3`.
- `'use client'` only on files that need browser hooks. Schema files have no `'use client'`.
- Never run package installs without asking the user first (per `MEMORY.md`).
- Surgical edits to Week 6 / Week 8 docs — only the parts that change. Keep their out-of-scope, exit-criteria, transition prose.

---

## 3. Stack additions

| Dep | Version | Purpose | Where used |
|---|---|---|---|
| `zod` | `^4.0.0` | Schema-first validation, Standard-Schema-compatible. **v4** chosen — top-level format validators (`z.email()`), unified `error:` parameter, faster parse, smaller bundle. **Caret** range OK because v4 promises stability within the major. | `lib/schemas/*`, route handlers, form `validators` |
| `@tanstack/react-form` | `~1.0.0` | Headless form state, type-safe field API. **Tilde** range pins the minor — Standard Schema integration shape changed in pre-v1; we cannot accept a silent v1.x → v1.y schema-API drift. | login/register/checkout pages |
| shadcn `field` | (registry) | `Field` / `FieldLabel` / `FieldDescription` / `FieldError` / `FieldGroup` / `FieldSet` / `FieldLegend` / `FieldSeparator` | every form |
| shadcn `label` | (registry — required by `field`) | `<Label>` primitive (used internally by `FieldLabel`) | transitive |

**ASK USER before running** any of:

```bash
bun add zod@^4 @tanstack/react-form@~1.0.0
bunx shadcn@latest add field label
```

(Week 8 also needs `textarea` — added in Week 8, not now, to keep this sprint tight. `checkbox` is **not** used anywhere in the spec; do not install it.)

---

## 4. Architecture decisions

### 4.1 zod schemas live in `lib/schemas/`, one file per domain

```
lib/schemas/
  index.ts          // re-exports
  auth.ts           // loginSchema, registerSchema, sessionUserSchema
  checkout.ts       // checkoutShippingSchema  (used in Wk 8)
```

(`product.ts` is intentionally NOT created in Wk 4.5 — see §4.4. Listed here only to fix the directory's expected shape if it lands later.)

- One schema = one named export ending in `Schema`.
- Inferred TS types via `z.infer<typeof xxxSchema>` exported alongside (`export type LoginInput = z.infer<typeof loginSchema>`).
- **`lib/types.ts` keeps its hand-written DB-row types.** Do not "promote" them to inferred types. DB rows and form inputs are different concerns; coupling them now creates churn the moment the schema diverges from the column set.

### 4.2 The two zod use-cases, kept separate

Per the user's brief: *"use it inside the form and outside the form to make sure the data structure matches what requested and strict types"*.

**Inside the form (load-bearing):** the schema is passed as the validator on `useForm({ validators: { onChange: schema } })`. TanStack Form parses on every change, attaches errors per field, gates `form.handleSubmit`. This is the user-visible validation layer.

**Outside the form (load-bearing, server side):** the same schema runs in the route handler before any DB write — `const parsed = schema.safeParse(await req.json()); if (!parsed.success) return Response.json({ error: 'invalid_form', fields: z.flattenError(parsed.error).fieldErrors }, { status: 400 })`. Server never trusts the client. The shared schema means client and server agree on what "valid" means by construction.

**API response parsing (decorative, opt-in):** Hooks like `useProducts` *may* call `productSchema.array().parse(json)` on response to detect server-shape regressions during dev. Decorative because today's API is internal and not version-skewed. Default: **skip it**. We will add it only when a regression bites; document the decision inline in the hook.

### 4.3 TanStack Form usage pattern (locked)

Source-of-truth: **shadcn's official `/docs/forms/tanstack-form` integration page** ([https://ui.shadcn.com/docs/forms/tanstack-form](https://ui.shadcn.com/docs/forms/tanstack-form)). The pattern below is copied from that page, not invented locally. Diverge only with cause.

Each form lives in its own page (`app/login/page.tsx`, `app/register/page.tsx`, `app/checkout/page.tsx`) — there is no shared `<Form>` wrapper component.

```tsx
const form = useForm({
  defaultValues: { email: '', password: '' } satisfies LoginInput,
  validators: { onChange: loginSchema },
  onSubmit: async ({ value }) => {
    await loginMutation.mutateAsync(value)
  },
})
```

```tsx
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
              id={field.name}
              name={field.name}
              type="email"
              autoComplete="email"
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
    {/* repeat for password */}
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
```

Notes locked into the pattern:

- `field.name` is used as the `id` for label/input wiring — TanStack Form names are stable, no collision risk on a single page.
- `field.state.meta.isTouched && !field.state.meta.isValid` is the canonical "show errors now" condition. **Errors are *computed* on every change (per `validators.onChange`); they are *displayed* only after the field has been touched** (i.e. after first blur fires `field.handleBlur`). Pre-touch the user sees nothing.
- **`<FieldError errors={field.state.meta.errors} />` consumes the array directly** — do not hand-render `<p>{errors.join(', ')}</p>` or the like. `FieldError` handles formatting, accessibility (`role="alert"`, `aria-live`), and styling. Wrap it in `{isInvalid && …}` (matching the shadcn canonical example) so the slot is empty pre-touch.
- Submit button reads `form.Subscribe` (not `form.state` directly) — avoids re-rendering the whole form on every keystroke.
- `validators: { onChange: schema }` runs on every change. We do **not** use `onBlur` mode for the form; field-level `onBlur` from the input still updates `meta.isTouched` for display gating.
- API stability is enforced by the tilde version pin (`~1.0.0`) in §3 — no minor-version drift between Wk 4.5 install and Wk 6 implementation. If the patterns here type-error against the installed package, that's a sign someone forced a minor bump; do **not** loosen the pin to fix it — investigate first.

### 4.4 What we deliberately do NOT add in 4.5

- No shared `<TextField>` / `<PasswordField>` wrapper component. Three forms (login, register, checkout) is below the rule-of-three threshold for extraction. Extract in Week 8 if the third form makes the duplication painful — not before.
- No `react-hook-form` (replaced by TanStack Form, which already pairs better with TanStack Query already in the project).
- No `zod`-based migration of `lib/types.ts` (see §4.1).
- No server-side parsing of `productListQuerySchema` for `/api/products` — that endpoint already coerces and clamps; rewriting it adds churn for zero behavior delta.
- No swap of `lib/sort.ts` to a zod enum. `CLIENT_SORT_KEYS as const` already gives a literal-union type; zod adds no extra safety here.
- No formal test harness — manual QA only, consistent with `PLAN.md`.

---

## 5. In-scope tasks

> Order matters; each step is verifiable independently before the next.

### 5.1 Install deps (ASK USER first)

```bash
bun add zod@^4 @tanstack/react-form@~1.0.0
bun audit                                # MUST be clean of "high"+ before proceeding (per ~/.claude/rules/security.md)
bunx shadcn@latest add field label
```

Verify: `package.json` lists `zod` at `^4.x.x` (v4 — NOT v3) and `@tanstack/react-form` at `~1.0.0`. `components/ui/field.tsx` and `components/ui/label.tsx` exist. `bun run type:check` passes. `bun run lint` passes. `bun audit` reports zero high/critical advisories — if any exist for either new dep, STOP and surface to the user before continuing. Also: confirm the installed zod version (`bun pm ls zod`) reports a 4.x major — earlier 3.x is rejected.

### 5.2 Create `lib/schemas/auth.ts`

```ts
import { z } from 'zod'

// zod v4 idioms used below:
// - Top-level format validators: z.email() not z.string().email() (v3 form is deprecated in v4).
// - Unified error parameter: { error: '...' } not { message: '...' } (v3 form deprecated).
// - .max() / .min() / .regex() still take an optional string-or-config; we pass strings.
//
// Bounds rationale:
// - email .max(254): RFC 5321 SMTP path limit.
// - password .max(200): bcrypt only hashes the first 72 bytes anyway, but capping
//   the *parsed* string prevents megabyte payloads from reaching bcrypt at all.
// - name .max(80): prevents arbitrary-length display names.
// - All error messages are STATIC strings — never close over `value` (security:
//   rejected user input must not echo back in the response body).

export const loginSchema = z.object({
  email: z.email({ error: 'Invalid email' }).trim().min(1, { error: 'Email is required' }).max(254, { error: 'Email too long' }),
  password: z.string().min(8, { error: 'At least 8 characters' }).max(200, { error: 'Password too long' }),
})
export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  email: z.email({ error: 'Invalid email' }).trim().min(1, { error: 'Email is required' }).max(254, { error: 'Email too long' }),
  name: z.string().trim().min(1, { error: 'Name is required' }).max(80, { error: 'Max 80 characters' }),
  // ORDER MATTERS: zod reports the FIRST failing rule. Keep min → letter → digit → max
  // so QA bullet "password 'aaaaaaaa' → At least one digit" stays accurate.
  password: z.string()
    .min(8, { error: 'At least 8 characters' })
    .regex(/[A-Za-z]/, { error: 'At least one letter' })
    .regex(/[0-9]/, { error: 'At least one digit' })
    .max(200, { error: 'Password too long' }),
})
export type RegisterInput = z.infer<typeof registerSchema>

// Mirrors `lib/session.ts:SessionUser` — Wk 6 may `import type { SessionUserParsed } from '@/lib/schemas/auth'`
// instead of redeclaring. Schema files have no DB deps, so this import direction is safe per AGENTS.md.
export const sessionUserSchema = z.object({
  id: z.int().positive(),
  email: z.email().max(254),
  name: z.string().min(1).max(80),
})
export type SessionUserParsed = z.infer<typeof sessionUserSchema>
```

Rules captured: same as the Week 6 hand-rolled regex (min 8, ≥1 letter, ≥1 digit). One regression-target — `Demo1234!` must pass `registerSchema.safeParse(...).success === true`. Add a one-time sanity REPL (run from the project root `/Users/stevenevan/Documents/GitHub/neotechpark/simple-ecommerce`):

```bash
bun -e "import('./lib/schemas/auth').then(m => console.log(m.registerSchema.safeParse({email:'demo@example.com',name:'Demo',password:'Demo1234!'})))"
```

Expected: `{ success: true, data: {...} }`. No committed test file — manual one-shot only.

### 5.3 Create `lib/schemas/checkout.ts`

```ts
import { z } from 'zod'

export const checkoutShippingSchema = z.object({
  name:    z.string().trim().min(1, { error: 'Required' }).max(120, { error: 'Too long' }),
  address: z.string().trim().min(1, { error: 'Required' }).max(200, { error: 'Too long' }),
  city:    z.string().trim().min(1, { error: 'Required' }).max(80, { error: 'Too long' }),
  zip:     z.string().trim().regex(/^\d{4,10}$/, { error: 'Digits only (4–10)' }),
})
export type CheckoutShippingInput = z.infer<typeof checkoutShippingSchema>
```

This replaces Week 8's planned `validateCheckoutForm`. Validation messages match the original brief exactly so QA does not change. `.max()` bounds added for DoS-resistance (security audit H2).

### 5.4 Decide `lib/validators.ts` fate

`lib/validators.ts` does not exist yet (Week 6 has not run). Outcome: **delete the Week 6 task that creates it.** Forward link the rule set into `lib/schemas/auth.ts` (already done in §5.2). See §6 for the Week 6 doc edits.

### 5.5 Create `lib/schemas/index.ts` barrel

```ts
export * from './auth'
export * from './checkout'
```

No helpers. Route handlers call zod's stock top-level **`z.flattenError(parsed.error).fieldErrors`** on rejection — same shape (`{ formErrors: string[], fieldErrors: Record<string, string[]> }`) as v3's `.flatten()`, but as a top-level function, not a deprecated instance method. This is zod v4's officially recommended idiom for form-friendly error output (the alternatives are `z.treeifyError()` for nested trees and `z.prettifyError()` for human-readable strings — neither matches the flat wire shape we want). Source: [zod docs › error-formatting](https://zod.dev/error-formatting). No deprecation warnings, no invented wrapper.

No `product.ts` for now — see §4.4.

### 5.6 Type-check & lint gate

`bun run type:check` and `bun run lint` must both be green with the schemas in place and no consumers yet. (Schemas are leaf modules; if they don't compile in isolation, they won't compile when consumed.)

### 5.7 Update `docs/sprints/week-06.md`

Surgical edits only — see §6.

### 5.8 Update `docs/sprints/week-08.md`

Surgical edits only — see §7.

### 5.9 Update `PLAN.md` constraints + dependency table

Surgical edits only — see §8.

### 5.9.1 Amend `AGENTS.md` — add `lib/schemas/**` to the module-direction rules

`AGENTS.md` currently lists `lib/types.ts`, `lib/hooks/**`, `lib/sort.ts`, `components/**` as forbidden importers of `@/lib/db/**`. `lib/schemas/**` is a new shared client/server namespace — make the rule explicit.

Anchor: the line beginning `- \`lib/types.ts\`, \`lib/hooks/**\`, \`lib/sort.ts\`, \`components/**\` MUST NOT import \`@/lib/db/**\``. Append a new bullet immediately after:

```
- `lib/schemas/**` is shared client/server. It must only import from `zod` itself (no `@/lib/db/**`, no `next/*` server APIs, no `'use client'` / `'use server'` pragmas). Both browser bundles and route handlers consume these files.
```

### 5.9.2 Add error-shape contract to `PLAN.md`

`PLAN.md` §7 (cross-cutting client conventions, line ~324 — "ky throws on 4xx/5xx by config…") needs a one-paragraph contract. Anchor: locate the bullet that begins `- **ky throws on 4xx/5xx**`. After that bullet, insert:

```
- **JSON error envelope (project-wide).** Every JSON error response uses the shape `{ error: string, fields?: Record<string, string[]> }`. `error` is a stable code (`invalid_form`, `invalid_credentials`, `cart_empty`, `insufficient_stock`, `payload_too_large`, `unauthorized`, …). `fields` is present only on `invalid_form` 400s and is the output of `z.flattenError(parsed.error).fieldErrors` — zod v4's stock top-level flattener (the non-deprecated replacement for v3's instance `.flatten()`). Clients may consume `fields` for per-field UI; clients that ignore it still get a usable `error` message.
```

### 5.10 Create `docs/sprints/week-04-5.md` (the sprint doc, separate from this plan)

Brief sprint-style doc mirroring the `week-NN.md` format (Goals / Dependencies / Tasks / QA / Exit / Transition). Replaces the heavy plan above with the same outcome a sprint reader expects. Sprint exit criteria:

- `lib/schemas/{auth,checkout,index}.ts` exist and type-check.
- `components/ui/field.tsx` and `components/ui/label.tsx` installed.
- `package.json` has `zod` and `@tanstack/react-form` pinned.
- Week 6 + Week 8 sprint docs reference zod schemas (not `lib/validators.ts`).
- No runtime behavior change — `bun dev` boots, `/` still renders, existing QA from Wk 1–4 still passes.

---

## 6. Surgical edits to `docs/sprints/week-06.md`

### 6.1 Goals paragraph

Append: *"Forms use TanStack Form + zod schemas from `lib/schemas/auth.ts` + shadcn `Field` primitives (per Week 4.5)."*

### 6.2 Dependencies (from prior weeks)

Add: `Wk 4.5: zod, @tanstack/react-form, shadcn Field installed; lib/schemas/auth.ts exposes loginSchema + registerSchema.`

### 6.3 In-scope task 4: **DELETE** the `lib/validators.ts` block

In `docs/sprints/week-06.md`, the block to delete starts at the line:

```
4. **Create `lib/validators.ts`:**
```

…and ends at the line:

```
   Wk 8 *extends* (does not recreate) this file with `validateCheckoutForm`.
```

(Includes the fenced TypeScript block in between.) Replace the entire deleted span with the single replacement bullet:

> 4. **Validation rules live in `lib/schemas/auth.ts`** (created Wk 4.5). No `lib/validators.ts` file. Server route handlers below import `loginSchema` / `registerSchema` and `safeParse` the request body before any DB work.

### 6.4 In-scope task 6: route handler bodies use `safeParse`

Two distinct rejection paths — never collapse them:

| Path | Status | Body | Concern |
|---|---|---|---|
| Schema parse fail (shape) | 400 | `{ error: 'invalid_form', fields: z.flattenError(err).fieldErrors }` | Form UX wants per-field errors |
| Business-rule fail (creds) | 401 | `{ error: 'invalid_credentials' }` (no `fields`) | User-enumeration prevention |

`/api/auth/register/route.ts`:

```ts
import { registerSchema } from '@/lib/schemas/auth'

const MAX_BODY_BYTES = 10_000   // 10 KB — covers all auth/checkout payloads with margin

export async function POST(req: NextRequest) {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_BODY_BYTES) return Response.json({ error: 'payload_too_large' }, { status: 413 })

  const json = await req.json().catch(() => null)
  const parsed = registerSchema.safeParse(json)
  if (!parsed.success) {
    return Response.json(
      // z.flattenError is zod v4's top-level form-friendly flattener (the
      // non-deprecated replacement for v3's instance .flatten()).
      { error: 'invalid_form', fields: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    )
  }
  const { email, name, password } = parsed.data
  // … uniqueness check + INSERT + session.save
}
```

`/api/auth/login/route.ts` mirrors with `loginSchema` AND adds **constant-time equalization** to defeat user-enumeration via timing (security audit H1):

```ts
import bcrypt from 'bcryptjs'
import { loginSchema } from '@/lib/schemas/auth'

// Module-level dummy hash. Cost matches our real hash cost (10 → ~80–150 ms compare).
// Hash a constant at boot — exact value is irrelevant; only the wall-clock cost matters.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

export async function POST(req: NextRequest) {
  // body-size cap as above
  const json = await req.json().catch(() => null)
  const parsed = loginSchema.safeParse(json)
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_form', fields: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    )
  }
  const { email, password } = parsed.data
  const user = getUserByEmail(email)
  // Always run a bcrypt compare — even on user-miss — so unknown vs. known emails
  // take comparable wall-clock time. Both branches return the SAME generic 401.
  const ok = user
    ? await bcrypt.compare(password, user.password_hash)
    : (await bcrypt.compare(password, DUMMY_HASH), false)
  if (!ok || !user) {
    return Response.json({ error: 'invalid_credentials' }, { status: 401 })
  }
  // … session save, return { user }
}
```

The schema-parse 400 path *cannot* re-introduce user enumeration because it fires only on **shape** problems (missing fields, wrong types, malformed email syntax) — the existence of the email in the DB is never consulted on this path. Once the body shape is valid, the only public response is the generic 401.

**Boundary recap (architect review #10):** the schema says *what shape is valid*; the route says *what credentials are allowed*. Shape-validation 400 vs. business-rule 4xx are independent — never collapse a credential failure into `invalid_form`.

### 6.5 In-scope tasks 9 & 10: rewrite login + register pages with TanStack Form

Replace the "client form … inline validation on blur using `validateEmail` / `validatePassword`" prose with the following — note `'use client'` is mandatory because `useForm` is a client hook:

```tsx
'use client'
import { useForm } from '@tanstack/react-form'
import { loginSchema, type LoginInput } from '@/lib/schemas/auth'
// + Field primitives, useLogin hook
const form = useForm({
  defaultValues: { email: '', password: '' } satisfies LoginInput,
  validators: { onChange: loginSchema },
  onSubmit: async ({ value }) => { await login.mutateAsync(value) },
})
```

Markup uses the §4.3 pattern. Demo creds block stays unchanged (`<p>Demo: <code>demo@example.com</code> / <code>Demo1234!</code></p>`). Register adds a `name` field; same pattern.

### 6.6 QA checklist additions

- [ ] Open `/login` for the first time → no `<FieldError>` rendered for either field (untouched).
- [ ] Type one char in email and blur → field is now touched and still invalid; error appears immediately ("Invalid email"). Continue typing a valid email → error clears on the change that makes it valid.
- [ ] Click submit on a fully empty form → all fields' errors show (TanStack Form marks fields touched on submit attempt); submit button is in disabled state because `canSubmit === false`.
- [ ] **Login timing parity (security H1).** Run `time curl -sX POST http://localhost:3000/api/auth/login -H content-type:application/json -d '{"email":"demo@example.com","password":"WRONG_pass1"}'` (known email, wrong password) AND `time curl -sX POST … -d '{"email":"unknown-${RANDOM}@example.com","password":"WRONG_pass1"}'` (unknown email). Both must return `401 invalid_credentials` AND wall-clock times must be within ~10–15 ms of each other. If the unknown-email response is conspicuously faster, the dummy-bcrypt equalization (§6.4) is missing or broken.
- [ ] **Body-size cap (security H2).** `curl -sX POST http://localhost:3000/api/auth/register -H content-type:application/json --data-binary "@<(yes '{}' | head -c 100000)"` → `413 payload_too_large`.
- [ ] Submit `/register` with `password: 'aaaaaaaa'` → field error reads "At least one digit" (zod regex message). With `'1234'` → "At least 8 characters". With `'abcd1234'` → no error.
- [ ] Server-side: `curl -X POST /api/auth/register -d '{"email":"x","name":"","password":"a"}' -H 'content-type:application/json'` → `400 { error: 'invalid_form', fields: { email:[...], name:[...], password:[...] } }`.
- [ ] Server-side: same curl with valid shape but wrong creds against `/api/auth/login` → `401 { error: 'invalid_credentials' }` (no `fields`).

### 6.7 Exit criteria edits

Replace `validators.ts covers email + password, ready for extension in Wk 8.` with `lib/schemas/auth.ts is the single source of truth for login/register rules; same schemas run client-side (TanStack Form validators) and server-side (route handler safeParse).`

### 6.8 Transition paragraph

Reword the last sentence's Wk 8 reference to: *"Wk 8 adds `lib/schemas/checkout.ts` (already created in Wk 4.5) and uses it in the same way."*

---

## 7. Surgical edits to `docs/sprints/week-08.md`

### 7.1 Goals — bullet 1

In `docs/sprints/week-08.md`, find the bullet that begins:

```
1. Hit `/checkout`, fill in a hand-rolled shipping form (no react-hook-form, no zod), submit.
```

Replace the parenthetical with the new wording — the line becomes:

```
1. Hit `/checkout`, fill in a shipping form built with TanStack Form + the `checkoutShippingSchema` zod schema (from `lib/schemas/checkout.ts`) + shadcn `Field` primitives, submit.
```

This eliminates the literal string "no zod" from the file (so the §9 grep stays clean).

### 7.2 Dependencies — replace existing line, do not just append

Find the bullet:

```
- Wk 6: `ensureSession`, `lib/validators.ts`.
```

Replace with:

```
- Wk 4.5: `lib/schemas/auth.ts`, `lib/schemas/checkout.ts`.
- Wk 6: `ensureSession`.
```

### 7.3 In-scope task 1: DELETE the `validateCheckoutForm` block

In `docs/sprints/week-08.md`, the block to delete starts at the line:

```
1. **Extend** existing `lib/validators.ts` (already created in Wk 6 — do not recreate):
```

…and ends at the closing line of the fenced TypeScript block (the line that is just `   ```` — the fence terminating the `export function validateCheckoutForm` snippet). Includes the entire fenced TypeScript block. Replace with:

> 1. **Schema is `checkoutShippingSchema` in `lib/schemas/checkout.ts`** (created Wk 4.5). No additions to `lib/validators.ts` (which never gets created). Same trim/regex/required rules as the original brief — see Wk 4.5 §5.3.

### 7.4 In-scope task 4: route handler

`POST /api/orders` body:

```ts
import { checkoutShippingSchema } from '@/lib/schemas/checkout'

const MAX_BODY_BYTES = 10_000

export async function POST(req: NextRequest) {
  const user = await ensureSession()  // 401 if logged out — unchanged from prior plan

  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_BODY_BYTES) return Response.json({ error: 'payload_too_large' }, { status: 413 })

  const parsed = checkoutShippingSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_form', fields: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    )
  }
  // then: cart-empty pre-check, createOrderForUser, etc. (unchanged)
}
```

Behavior identical to the previous spec — only the implementation changes. `ensureSession()` runs *before* `safeParse` so unauthenticated callers can't even probe the schema.

### 7.5 In-scope task 6: rewrite checkout page

- Add the shadcn primitives this page needs (and only this page):
  ```bash
  bunx shadcn@latest add textarea
  ```
  (ASK USER before running.) `Field` and `Label` are already in from Wk 4.5.
- Replace "plain `<input>` inside shadcn `<Input>` and `<Label>`. Local React state for values + an `errors` state object derived from `validateCheckoutForm`" with the §4.3 pattern using `useForm({ validators: { onChange: checkoutShippingSchema }, onSubmit: ({ value }) => createOrder.mutateAsync(value) })`.
- Submit button uses `form.Subscribe` to gate on `canSubmit && !isSubmitting && cart.items.length > 0` (the cart-empty guard is still derived from `useCart()`).

### 7.6 QA checklist edits

- The existing "clear zip → inline error 'Digits only (4–10)'" entry stays (zod's regex message is the same string).
- Add: `Server-side bypass via curl with malformed JSON → 400 invalid_form, fields object names match { name | address | city | zip }`. (This is what the existing curl line already verifies; just confirm the response shape under the new schema.)

### 7.7 Exit criteria edits

No structural change — the bullets *"Full happy path…"*, *"Stock decrement is atomic…"*, *"Snapshots…"* all stand. Add:

- *"Checkout form uses TanStack Form + `checkoutShippingSchema` (Wk 4.5); no parallel hand-rolled validator exists."*

---

## 8. Surgical edits to `PLAN.md`

All four edits are verified against the current `PLAN.md` (403 lines). Anchors below are the literal strings to find — no conditionals.

### 8.1 §2 Constraints — DROP one, ADD one

Anchor: line 26 — `- No third-party libs in checkout (form validation hand-rolled).`

Action: delete the line entirely. Add immediately after the surrounding constraints block (after line 33's `bun install` rule):

> - Forms use `zod` schemas (`lib/schemas/*`) + `@tanstack/react-form` + shadcn `Field` primitives. Same schema validates on the client (form `validators`) and on the server (route-handler `safeParse`). Rule introduced in Week 4.5.

### 8.2 §2 Stack table — append two rows

Anchor: the `| Tests | **Manual QA per sprint** ...` row (line 22). Insert two rows immediately above it (so all dep rows stay grouped before the Tests row):

```
| Form state    | **TanStack Form v1**                              | pairs naturally with TanStack Query already in stack; Standard-Schema-compatible |
| Validation    | **zod v4**                                        | shared client + server schemas; top-level `z.email()` / `z.flattenError()` / unified `error:` parameter |
```

### 8.3 Sprint Map (§5 — line 138, Week 4 row)

Anchor: `| 4 | Filter / sort / search | FilterBar, URL-synced search params, debounced text, categories endpoint |` (line 138).

Insert immediately after that line:

```
| 4.5 | Forms foundation | zod schemas + TanStack Form + shadcn Field; retro-edits to Wk 6/8 plans |
```

### 8.4 §4 file inventory (line 123)

Anchor: `validators.ts      hand-rolled email/password/checkout form validators` (line 123).

Replace with:

```
schemas/auth.ts    zod schemas: loginSchema, registerSchema, sessionUserSchema (Wk 4.5)
schemas/checkout.ts zod schemas: checkoutShippingSchema (Wk 4.5)
```

### 8.5 §8 Week 8 row in roadmap table (line 142)

Anchor: `| 8 | Checkout & orders | POST /api/orders (txn snapshots), checkout form (hand-rolled validation), success page, /orders list |`

Replace `(hand-rolled validation)` with `(zod + TanStack Form)`. Full row becomes:

```
| 8 | Checkout & orders | POST /api/orders (txn snapshots), checkout form (zod + TanStack Form), success page, /orders list |
```

### 8.6 Exit checklist (line 376)

Anchor: `- [x] \`validators.ts\` extended (not recreated) in Wk 8.` (line 376, confirmed present).

Replace with:

```
- [x] `lib/schemas/auth.ts` and `lib/schemas/checkout.ts` authored in Wk 4.5; consumed in Wk 6 and Wk 8 (no `lib/validators.ts`).
```

---

## 9. Verification (sprint-level)

Run after all five edits:

```bash
bun install            # if deps installed
bun run type:check     # green
bun run lint           # green
bun dev                # / still renders identically; no console errors
```

Plus: read `docs/sprints/week-06.md` and `docs/sprints/week-08.md` end-to-end and confirm no leftover references to `lib/validators.ts` or `validateCheckoutForm` exist.

```bash
grep -nE 'validators\.ts|validateCheckoutForm|validateEmail|validatePassword|no zod|hand-rolled (validation|shipping form)' docs/sprints/week-0[68].md PLAN.md
# expected: no matches
```

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| TanStack Form v1 API shifts before Wk 6 ships | Pin minor version (`^1.0.0`, no `^2`); re-read its `dist/docs` if a minor bumps before Wk 6. |
| `z.flattenError` shape drift between zod v4 minors | Pin `zod` to `^4.0.0`. Wire shape `{ formErrors: string[], fieldErrors: Record<string, string[]> }` is part of zod v4's stable surface; clients consume `fields` only and should not assume more. |
| shadcn `field` registry changes the component shape | Generated file is committed at install — registry updates do not retroactively rewrite our copy. Re-run `bunx shadcn@latest add field` only if we explicitly opt in. |
| `lib/schemas/*` accidentally pulls a server-only dep | Schema files only `import { z } from 'zod'`. Lint rule (oxlint) catches `@/lib/db/**` imports per `AGENTS.md`. Re-run `bun run lint` after adding each schema. |
| Rule drift between client and server because someone re-implements validation in a route handler | The `safeParse` pattern is committed in Wk 6 + Wk 8 docs. Code review item: any route that accepts a JSON body must `safeParse` against a schema in `lib/schemas/`, not parse fields manually. |
| Wk 6 / Wk 8 doc edits land in a Git diff that is hard to review | Apply edits one sprint doc per commit; commit message names the sprint doc updated. |
| A future zod schema adds a refinement whose error message closes over the input value, echoing user input back to the client (e.g. password) | **Project rule:** all zod error messages must be static strings — no message function may close over `value`. Already followed in §5.2 / §5.3. Code-review item; surfaces as a security regression if violated. |
| `z.flattenError` renamed/removed in a future zod major | Very low risk — it's the v4 *replacement* for `.flatten()`, sitting alongside `z.treeifyError()` and `z.prettifyError()` as the canonical formatting trio. If it does shift, swap at three call sites mechanically. No pre-emptive wrapper. |
| TanStack Form Standard-Schema integration shape changes within v1.x | Tilde version range pin (`~1.0.0`) prevents silent minor bumps. |
| `[id]` URL params accepted as `Number(id)` produce `NaN` (returns no rows, but wastes a query) | **Out-of-scope of Wk 4.5** (security audit M2). Documented as forward-looking — Wk 7/8 implementers should add `z.coerce.number().int().positive().safeParse(id)` at top of dynamic route handlers. Not blocking; record as a follow-up. |

---

## 11. Out-of-scope (explicit)

- `lib/types.ts` migration to inferred types from zod.
- API response zod parsing in `useProducts` / `useCategories`.
- `react-hook-form`, `formik`, `valibot`, `arktype`. We picked TanStack Form + zod and we're sticking.
- A shared `<TextField>` wrapper component.
- Zod runtime parsing of route handler URL search params (e.g. `productListQuerySchema` for `/api/products`). Existing per-param coercion stays.
- Tests. Manual QA only, per the project rule.

---

## 12. Done means

1. `lib/schemas/auth.ts`, `lib/schemas/checkout.ts`, `lib/schemas/index.ts` exist and type-check.
2. `components/ui/field.tsx` and `components/ui/label.tsx` exist (installed via `shadcn` CLI).
3. `package.json` lists `zod` and `@tanstack/react-form`.
4. `docs/sprints/week-06.md` no longer mentions `lib/validators.ts`; references `lib/schemas/auth.ts` instead, login/register pages described with TanStack Form + Field pattern.
5. `docs/sprints/week-08.md` no longer mentions `validateCheckoutForm` or "no zod"; references `lib/schemas/checkout.ts` and TanStack Form.
6. `PLAN.md` constraint dropped + stack table extended + sprint row inserted.
7. `docs/sprints/week-04-5.md` exists as the sprint-formatted doc.
8. `bun run type:check` + `bun run lint` + `bun dev` all green; `/` and existing QA from Wk 1–4 still pass.
9. `grep` from §9 returns no leftover references.

---

## Review Trail

### Metis Plan Consultant
- [x] §6.6 QA item rewritten — separated "untouched = no error" from "touched + invalid = error appears immediately" (must-fix #1).
- [x] §4.3 notes block clarifies "errors computed on every change, displayed only after touch" (must-fix #2).
- [x] §6.3 + §7.3 now quote the exact start/end anchor lines for the Week 6 / Week 8 doc deletions (must-fix #3).
- [x] §7.2 replaces (not appends to) the existing `Wk 6: ensureSession, lib/validators.ts.` dependency line (must-fix #4).
- [x] §7.1 explicitly removes the literal "no zod" string from week-08 Goals bullet 1 (must-fix #5).
- [x] §4.3 adds a pre-flight `node_modules/@tanstack/react-form/dist/...` API check before Wk 6 ships (should-fix #6).
- [x] §8 PLAN.md edits now unconditional with verified line anchors (lines 22, 26, 123, 138, 142, 376) — split into §§8.1–8.6 (should-fix #7).
- [x] §5.2 REPL command annotated with required `cwd` (should-fix #8).
- [x] §4.1 directory diagram dropped `product.ts` to match §4.4 + §5.5 (consider #9).
- [x] §6.5 explicitly notes `'use client'` is required (consider #10).
- [x] §9 grep extended to also catch `no zod` and `hand-rolled (validation|shipping form)` across Wk 6, Wk 8, AND `PLAN.md` (consider #11).

### Security Auditor
- [x] HIGH H1: Wk 6 §6.4 login route adds module-level `DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)` and runs a bcrypt compare on user-miss to equalize timing. QA bullet added in §6.6 to time-test known vs unknown email (≤15 ms delta).
- [x] HIGH H2: §5.2 + §5.3 schemas now `.max()`-bound every string field (email 254, password 200, name 80, address 200, city 80). Wk 6 §6.4 + Wk 8 §7.4 route handlers reject `Content-Length > 10_000` with 413 before parsing JSON. QA bullet for 100 KB body → 413.
- [x] MEDIUM M1: covered by H2 caps.
- [x] MEDIUM M2: §10 risk table calls out `[id]` numeric guard as out-of-scope of Wk 4.5; documented as a forward-looking item for Wk 7/8 implementers (not blocking).
- [x] MEDIUM M3: §10 risk table adds explicit "all zod error messages must be static strings — no message function may close over `value`" rule.
- [x] LOW L3: §5.1 install step now runs `bun audit` after `bun add`; STOP if any high/critical advisories exist for the new deps.

### Architect Reviewer
- [x] Must-address #1: §5.9.1 amends `AGENTS.md` to add `lib/schemas/**` to the module-direction rules with explicit "zod-only imports" allowlist.
- [x] Must-address #2: §5.9.2 adds JSON error envelope contract (`{ error: string, fields?: Record<string,string[]> }`) to `PLAN.md` §7.
- [x] Should-address #3: §5.2 cross-links `sessionUserSchema` → `lib/session.ts:SessionUser` with import-direction note (schemas have no DB deps, safe).
- [x] Should-address #4: §3 explicitly excludes `checkbox` from Wk 8 follow-up installs (only `textarea` needed).
- [x] Should-address #5: tilde version pin (`~1.0.0` for TanStack Form) replaces the brittle "open node_modules and inspect" pre-flight check; §4.3 notes block updated.
- [x] Nice-to-have #9: §5.2 schema has explicit comment locking the regex order (digit rule last) so the QA bullet "password 'aaaaaaaa' → digit error" stays accurate.
- [x] Nice-to-have #10: §6.4 prose explicitly draws the shape-validation 400 vs. business-rule 4xx boundary.
- [x] Nice-to-have #6, #7, #8: no change needed (decisions confirmed correct as-is).

### User overrides applied mid-review
- [x] **zod v4** (was v3.25 in initial draft). Schemas migrated to top-level `z.email()` (not `z.string().email()`) and unified `{ error: '...' }` parameter (not `{ message: '...' }`). Version pin updated to `^4.0.0`.
- [x] **shadcn `FieldError` self-renders** the errors array via the `errors` prop — confirmed against the shadcn `/docs/forms/tanstack-form` page; §4.3 already used this pattern, now explicitly cited and reinforced ("do not hand-render `<p>{errors.join(', ')}</p>`").
- [x] **Prefer canonical/library APIs over hand-rolled wrappers** (per saved feedback). Dropped the invented `fieldErrorsOf` helper.
- [x] **No deprecated APIs.** First draft used `parsed.error.flatten().fieldErrors` (deprecated instance method in v4) under the rationale "deprecated-but-works > custom wrapper". Per direct user override, switched to **`z.flattenError(parsed.error).fieldErrors`** — zod v4's top-level, **non-deprecated** idiomatic replacement, same shape, no warnings. Source: `https://zod.dev/error-formatting`. Schemas already use `z.email()` top-level + unified `error:` parameter; no other deprecated v3 idioms remain. §10 risk row reframed accordingly.

### Momus Plan Reviewer
- [x] All file-existence claims verified (created files do not exist; edited files do).
- [x] All PLAN.md anchor lines (22, 26, 123, 138, 142, 376) verified by direct read.
- [x] All `docs/sprints/week-06.md` deletion anchors (L70 start, L83 end) verified.
- [x] All `docs/sprints/week-08.md` deletion / replacement anchors (L6, L15, L25) verified.
- [x] zod v4 API claims (`z.email({ error })`, `z.flattenError(err).fieldErrors`, `z.int().positive()`, unified `error:` parameter) confirmed against current zod docs.
- [x] TanStack Form v1 + shadcn `Field` family imports + render-prop pattern confirmed against shadcn `/docs/forms/tanstack-form`.
- [x] Internal consistency check passed (no orphan references after `fieldErrorsOf` removal and `product.ts` exclusion).
- [x] **Nit fix #1:** §10 risk row 2 reframed from "pin v3.25.x NOT v4" → "pin v4; `z.flattenError` shape stable in v4".
- [x] **Nit fix #2:** §8.2 stack-table replacement row updated from `**zod v3.25+**` → `**zod v4**` (with v4 idiom note).
- [x] Verdict: **APPROVED FOR EXECUTION.**
