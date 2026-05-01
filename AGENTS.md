<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Conventions

- Page-specific client islands live in `app/<route>/<Name>.tsx` (root route `/` → directly in `app/`); reusable domain components live in `components/`.
- `lib/hooks/*` query hooks classified as load-bearing or decorative. Load-bearing surfaces errors to UI; decorative logs to console and falls back silently. Document the choice inline in the hook.
- `lib/types.ts`, `lib/hooks/**`, `lib/sort.ts`, `components/**` MUST NOT import `@/lib/db/**` (server-only — pulls native better-sqlite3 into the client bundle).
- `lib/schemas/**` is shared client/server. It must only import from `zod` itself (no `@/lib/db/**`, no `next/*` server APIs, no `'use client'` / `'use server'` pragmas). Both browser bundles and route handlers consume these files.
- Forms use `zod` schemas (`lib/schemas/*`) + `@tanstack/react-form` + shadcn `Field` primitives. Same schema validates on the client (form `validators.onChange`) and on the server (route-handler `safeParse`). Server returns `400 { error: 'invalid_form', fields: z.flattenError(err).fieldErrors }` on shape failure; never collapse business-rule failures (e.g. bad credentials) into `invalid_form`.
