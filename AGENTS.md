<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Conventions

- Page-specific client islands live in `app/<route>/<Name>.tsx` (root route `/` → directly in `app/`); reusable domain components live in `components/`.
- `lib/hooks/*` query hooks classified as load-bearing or decorative. Load-bearing surfaces errors to UI; decorative logs to console and falls back silently. Document the choice inline in the hook.
- `lib/types.ts`, `lib/hooks/**`, `lib/sort.ts`, `components/**` MUST NOT import `@/lib/db/**` (server-only — pulls native better-sqlite3 into the client bundle).
