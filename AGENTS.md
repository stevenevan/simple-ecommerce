<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Conventions

- Page-specific client islands live in `app/<route>/<Name>.tsx` (root route `/` → directly in `app/`). When a route grows multiple islands, group them under `app/<route>/_components/`. App-wide chrome (header, cart drawer) lives in `app/_components/`. Reusable domain components live in `components/`; shadcn primitives in `components/ui/`.
- Route-scoped query/mutation hooks live in `app/<route>/_hooks/*` (or `app/_hooks/*` for app-wide chrome). Cross-route shared hooks live in `lib/hooks/*`.
- `lib/hooks/*` query hooks classified as load-bearing or decorative. Load-bearing surfaces errors to UI; decorative logs to console and falls back silently. Document the choice inline in the hook.
- `lib/types.ts`, `lib/hooks/**`, `lib/sort.ts`, `components/**` MUST NOT import `@/lib/db/**` (server-only — pulls native better-sqlite3 into the client bundle).
- `lib/schemas/**` is shared client/server. It must only import from `zod` itself (no `@/lib/db/**`, no `next/*` server APIs, no `'use client'` / `'use server'` pragmas). Both browser bundles and route handlers consume these files.
- Route handlers go through `lib/db/queries.ts` (Kysely via `lib/db/kysely.ts`); avoid raw better-sqlite3 outside one-shot CLI scripts (`lib/db/migrate.ts`, `lib/db/seed.ts`).
- Forms use `zod` schemas (`lib/schemas/*`) + `@tanstack/react-form` + shadcn `Field` primitives. Same schema validates on the client (form `validators.onChange`) and on the server (route-handler `safeParse`). Server returns `400 { error: 'invalid_form', fields: z.flattenError(err).fieldErrors }` on shape failure; never collapse business-rule failures (e.g. bad credentials) into `invalid_form`.

## Tests

- `npm test` — Vitest. Unit (`tests/unit/`) + in-process integration (`tests/integration/`) against in-memory SQLite. Setup pins `SESSION_SECRET` and `SQLITE_PATH=:memory:` in `vitest.config.ts`.
- `npm run test:e2e` — Playwright. API specs in `tests/api/`, browser specs in `tests/e2e/`. Boots dev server on `:3100` against `data/test.db` with pinned test-only `SESSION_SECRET`.
