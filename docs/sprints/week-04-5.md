# Week 4.5 — Forms Foundation (zod + TanStack Form + shadcn `Field`)

## Goals

Establish the form-handling foundation that Wk 6 (auth login/register) and Wk 8 (checkout) will consume. **Zero user-visible features ship in this sprint** — it's pure scaffolding plus retroactive edits to un-run sprint docs (6, 8) so the original "hand-rolled validators" plan does not get implemented and then immediately rewritten.

The pattern: zod schemas in `lib/schemas/*` are consumed *inside* TanStack Form (client validators) AND *outside* the form (server-side `safeParse` of request bodies). One source of truth for "what shape is valid", running on both sides of the wire.

## Dependencies (from prior weeks)

- Wk 1: Tailwind v4 + shadcn `base-nova` initialized; `components/ui/{button,input,card,…}` installed.
- Wk 4: filter UI shipped on the home page (no forms yet).
- This sprint is **independent of Wk 5** (product detail) — it can ship before or after Wk 5 with no conflict.

## Pre-flight reading

- Source-of-truth integration page: <https://ui.shadcn.com/docs/forms/tanstack-form>
- zod v4 error formatting: <https://zod.dev/error-formatting>

## In-scope tasks

1. **Install deps — ASK USER before running:**
   ```bash
   bun add zod@^4 @tanstack/react-form@~1.0.0
   bun audit                                       # block on high/critical advisories only
   bunx shadcn@latest add field label
   ```
   Verify: `package.json` lists `zod` at `^4.x.x` (NOT v3) and `@tanstack/react-form` at `~1.0.0`. `components/ui/field.tsx` and `components/ui/label.tsx` exist.

2. **Create `lib/schemas/auth.ts`** — `loginSchema`, `registerSchema`, `sessionUserSchema` (mirrors `lib/session.ts:SessionUser`). v4 idioms: top-level `z.email()`, unified `{ error: '...' }` parameter, `.max()` bounds on every string, regex order locked (digit rule last).

3. **Create `lib/schemas/checkout.ts`** — `checkoutShippingSchema` (`name`, `address`, `city`, `zip`). Same trim/regex/required rules as the original Wk 8 hand-rolled spec.

4. **Create `lib/schemas/index.ts` barrel** — `export * from './auth'; export * from './checkout'`. No helpers; route handlers call zod's stock `z.flattenError(parsed.error).fieldErrors` directly.

5. **Update `AGENTS.md`** — add `lib/schemas/**` to the module-direction rules (zod-only imports; no `@/lib/db/**`, no `next/*` server APIs, no client/server pragmas). Add the form/validation convention.

6. **Update `PLAN.md`** — drop "no third-party libs in checkout" constraint; add `Form state | TanStack Form v1` and `Validation | zod v4` to the stack table; insert Wk 4.5 row in the sprint map; replace the `validators.ts` line in the file inventory with `schemas/auth.ts` + `schemas/checkout.ts`; add the JSON error envelope contract to §7 (cross-cutting client conventions).

7. **Update `docs/sprints/week-06.md`** — references `lib/schemas/auth.ts` instead of `lib/validators.ts`; login/register pages described with TanStack Form + Field pattern; route handlers `safeParse` body and return `{ error: 'invalid_form', fields: z.flattenError(err).fieldErrors }` on 400; login route adds `DUMMY_HASH` constant-time equalization.

8. **Update `docs/sprints/week-08.md`** — references `lib/schemas/checkout.ts`; checkout form uses TanStack Form + Field; route handler does same `safeParse` + body-size cap. Adds Wk 8-only `bunx shadcn@latest add textarea`.

## Out-of-scope

- No forms ship as user-visible features — Wk 6 and Wk 8 do that.
- No `lib/types.ts` migration to `z.infer<...>` (DB rows and form inputs are different concerns; keep parallel ladders).
- No `productListQuerySchema` for `/api/products` (existing per-param coercion stays — no behavior delta).
- No shared `<TextField>` wrapper component (rule of three: revisit at the 4th form, not now).
- No `react-hook-form`, `formik`, `valibot`, `arktype`.
- No formal test harness — manual QA only.

## Manual QA checklist

- [ ] `bun pm ls zod` reports a 4.x major; `bun pm ls @tanstack/react-form` reports 1.0.x.
- [ ] `components/ui/field.tsx` exports `Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldSeparator`.
- [ ] `bun run type:check` passes.
- [ ] `bun run lint` passes.
- [ ] `bun audit` reports zero high/critical advisories.
- [ ] `bun dev` boots; `/` still renders identically; existing Wk 1–4 QA still passes (filter, sort, search round-trip through reload + back/forward).
- [ ] Schema regression sanity (run from project root):
  ```bash
  bun -e "import('./lib/schemas/auth').then(m => console.log(JSON.stringify(m.registerSchema.safeParse({email:'demo@example.com',name:'Demo',password:'Demo1234!'}))))"
  ```
  Expected: `{"success":true,"data":{...}}` — the seeded demo password must still parse.
- [ ] Schema rejection sanity:
  ```bash
  bun -e "import('./lib/schemas/auth').then(async m => { const z = await import('zod'); const r = m.registerSchema.safeParse({email:'demo@example.com',name:'Demo',password:'aaaaaaaa'}); console.log(JSON.stringify(z.flattenError(r.error).fieldErrors)) })"
  ```
  Expected: `{"password":["At least one digit"]}` — order-of-rules must report digit, not letter.
- [ ] Grep audit returns NO matches:
  ```bash
  grep -nE 'validators\.ts|validateCheckoutForm|validateEmail|validatePassword|no zod|hand-rolled (validation|shipping form)' docs/sprints/week-0[68].md PLAN.md
  ```

## Exit criteria

- `lib/schemas/{auth,checkout,index}.ts` exist and type-check.
- `components/ui/{field,label}.tsx` installed.
- `package.json` lists `zod ^4` and `@tanstack/react-form ~1.0.0`.
- `AGENTS.md` covers `lib/schemas/**`.
- `PLAN.md` constraint dropped, stack table extended, sprint row inserted, file inventory updated, error envelope documented.
- `docs/sprints/week-06.md` references `lib/schemas/auth.ts` (no `lib/validators.ts`).
- `docs/sprints/week-08.md` references `lib/schemas/checkout.ts` (no `validateCheckoutForm`, no "no zod" string).
- No runtime behavior change — `bun dev` boots; `/` renders; existing QA passes.

## Transition to Week 5

Wk 5 (product detail page) is unaffected — no forms involved. Wk 6 (authentication) is the first sprint that consumes this foundation: it uses `loginSchema`/`registerSchema` from `lib/schemas/auth.ts` inside TanStack Form for the login + register pages, and the same schemas inside route handlers for server-side `safeParse`. Wk 8 picks up `checkoutShippingSchema` for the checkout form.
