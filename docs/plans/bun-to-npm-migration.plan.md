# Plan: Migrate bun → npm

## Context

Project currently uses bun as the package manager and script runner. User wants
to switch to npm. Node 24 is already pinned (`.nvmrc`, `engines.node`), and
npm ships with Node 24, so no separate install is required.

The change is documentation-and-config only — no application code (`app/**`,
`lib/**`, `components/**`, `tests/**`) references bun runtime APIs. Source
"bun" matches in `lib/sort.ts` and `tsconfig.json` are substrings of `bundle`/
`bundler` (false positives). `@types/bun` in `node_modules` is transitive and
disappears after `rm -rf node_modules` + `npm install`.

## Scope

**In scope** — replace bun in:
- `package.json` scripts (`bun run` calls inside scripts)
- `package.json` bun-specific fields (`ignoreScripts`, `trustedDependencies`)
- `playwright.config.ts` web-server command
- `scripts/download-seed-images.ts` usage comment **and** the top-level
  `await main()` (Metis-flagged; will not run under bare `node`)
- `README.md` quick-start + tests sections
- `AGENTS.md` test commands
- `docs/hands-on/01-feature.prompt.md` and `02-tests.prompt.md` — these are
  **active workshop runbooks**, not historical records. Following them
  post-migration would invoke `bun vitest` / `bun playwright` which will
  fail. Update to npm.
- Replace `bun.lock` with `package-lock.json`

**Out of scope** — historical sprint records and design diaries:
- `docs/plans/wk*-impl.md`, `docs/plans/week-*.plan.md` — past sprint plans.
- `docs/plans/playwright-tests.plan.md` — past plan, already implemented.
- `docs/sprints/week-*.md` — sprint logs.
- `PLAN.md` (root) — implementation diary; references Node 20.9, `bun add`,
  `bunx shadcn@latest`. Rewriting history is churn. Excluded from
  verification grep (see below).

If user later wants the historical docs scrubbed, separate task.

## Decision: bun-specific package.json fields

`package.json` currently has:

```json
"ignoreScripts": ["sharp", "unrs-resolver"],
"trustedDependencies": ["better-sqlite3", "sharp", "unrs-resolver"]
```

Both are bun-specific. npm honors neither.

- `ignoreScripts` (array form) → bun-only. npm's equivalent is the global
  `.npmrc` `ignore-scripts=true` (boolean, all-or-nothing).
- `trustedDependencies` → bun-only allowlist for postinstall when scripts
  are globally ignored. No npm equivalent.

**Choice:** delete both fields. Under npm, postinstall scripts run by default
for all deps. `better-sqlite3` will rebuild its native binding; `sharp`
downloads its prebuilt binary; `unrs-resolver` runs whatever it runs. This is
standard npm posture for a Node-only project. If the user wants tighter
control later, add `.npmrc` with `ignore-scripts=true` and rely on
`npm rebuild better-sqlite3` post-install — out of scope here.

## Changes

### 1. `package.json`

Replace `bun run` with `npm run` inside script bodies and drop bun-only fields.

```diff
   "scripts": {
     "db:migrate": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/db/migrate.ts",
     "db:seed": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/db/seed.ts",
-    "db:reset": "rm -f data/app.db data/app.db-* && bun run db:migrate && bun run db:seed",
-    "images:download": "bun run scripts/download-seed-images.ts",
+    "db:reset": "rm -f data/app.db data/app.db-* && npm run db:migrate && npm run db:seed",
+    "images:download": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/download-seed-images.ts",
```

Note: `images:download` previously relied on bun's TS loader. Switch to
`node` (Node 24 supports TS via `--experimental-strip-types`, on by default
in 22.7+, no flag needed in 24). The `--disable-warning` flag matches the
existing `db:migrate` / `db:seed` pattern. Verify by running it.

```diff
-  "ignoreScripts": [
-    "sharp",
-    "unrs-resolver"
-  ],
-  "trustedDependencies": [
-    "better-sqlite3",
-    "sharp",
-    "unrs-resolver"
-  ]
+  // (both fields removed)
```

### 2. `playwright.config.ts:33`

```diff
-    command: `bun run dev --port ${PORT}`,
+    command: `npm run dev -- --port ${PORT}`,
```

`--` is required by npm to forward flags to the underlying `next dev` command.
bun forwards flags directly; npm needs the separator.

### 3. `scripts/download-seed-images.ts`

Two changes — comment **and** the bottom-of-file invocation.

```diff
-// Usage:  bun run scripts/download-seed-images.ts [--only-missing]
+// Usage:  npm run images:download -- [--only-missing]
```

```diff
-await main()
+main().catch((err) => {
+  console.error(err)
+  process.exit(1)
+})
```

**Why the second change:** the file ends with `await main()` (top-level
await). Under bun this works regardless of module mode. Under bare `node`,
top-level await requires the file to load as ESM. The project's
`package.json` has no `"type": "module"`, so Node uses syntax detection
(stable in 24.x via `--experimental-detect-module`) — likely succeeds, but
this is the only script in the repo with top-level await and we don't want
to gamble. Sibling scripts `lib/db/migrate.ts` and `lib/db/seed.ts` use
`if (import.meta.main) { ... }` blocks with no top-level await and already
run under `node` today, confirming the pattern. Rewriting `await main()` as
`main().catch(...)` removes the dependency entirely and keeps the script
runnable under any loader.

### 4. `README.md`

Replace bun commands with npm equivalents in the hand-off, seed-images, and
tests sections (lines 11, 13–14, 27, 31, 39, 42, 44, 69):

```diff
-bun install
+npm install
-bun run db:reset
-bun dev
+npm run db:reset
+npm run dev
```

```diff
-`bun run db:seed` falls back to ...
+`npm run db:seed` falls back to ...
```

```diff
-bun run images:download
+npm run images:download
```

```diff
-- **Vitest** (`bun run test`) — ...
-- **Playwright** (`bun run test:e2e`) — ... Run `bun run test:e2e:install` ...
+- **Vitest** (`npm test`) — ...
+- **Playwright** (`npm run test:e2e`) — ... Run `npm run test:e2e:install` ...
```

The "Getting Started" boilerplate (lines 58–70) is the create-next-app
template that already lists `npm run dev`/`yarn dev`/`pnpm dev`/`bun dev`.
Drop the `bun dev` line for consistency with the migration:

```diff
 npm run dev
 # or
 yarn dev
 # or
 pnpm dev
-# or
-bun dev
```

### 5. `AGENTS.md` (lines 19–20)

```diff
-- `bun run test` — Vitest. ...
-- `bun run test:e2e` — Playwright. ...
+- `npm test` — Vitest. ...
+- `npm run test:e2e` — Playwright. ...
```

### 6. `docs/hands-on/01-feature.prompt.md` and `02-tests.prompt.md`

These are active workshop prompts run by humans/agents to execute work.
Update bun invocations to npm equivalents.

`01-feature.prompt.md:46`:

```diff
-`bun vitest run` is green
+`npm test` is green
```

`02-tests.prompt.md:9-10, 47`:

```diff
-- Vitest: `bun vitest run`
-- Playwright: `bun playwright test`
+- Vitest: `npm test`
+- Playwright: `npm run test:e2e`
```

```diff
-Stop after `bun vitest run` is green and `bun playwright test cart-select` is …
+Stop after `npm test` is green and `npx playwright test cart-select` is …
```

(Use `npx playwright test <pattern>` since `npm run test:e2e` doesn't accept
a positional spec name without `--`. Equivalent to the bun direct-invoke.)

### 7. Lockfile swap

```bash
rm bun.lock
rm -rf node_modules
npm install
```

Commits the resulting `package-lock.json`. `bun.lock` removed from repo.
`.gitignore` already excludes `node_modules/` — no change there.

### 8. `.gitignore` audit

Confirm `bun.lock` is not in `.gitignore` (so the deletion is tracked).
Confirm `package-lock.json` is not ignored (so it is committed). Verified:
neither name appears in `.gitignore` today. Once bun is no longer the
runner, `bun.lock` will not regenerate silently — no lockfile-conflict risk.

## Implementation Order

1. Edit `package.json` (scripts + drop bun fields) → verify JSON parses
   (`node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`).
2. Edit `playwright.config.ts:33`.
3. Edit `scripts/download-seed-images.ts` (comment + replace `await main()`
   with `main().catch(...)`).
4. Edit `README.md`.
5. Edit `AGENTS.md`.
6. Edit `docs/hands-on/01-feature.prompt.md`, `02-tests.prompt.md`.
7. `rm bun.lock && rm -rf node_modules && npm install` → verify
   `package-lock.json` created and `node_modules/.bin/next` exists.
8. Run verification battery (below).
9. Commit. Suggested message: `chore: migrate package manager from bun to npm`.

## Verification

Run each and confirm green / expected output:

| Step | Command | Expected |
|------|---------|----------|
| install | `npm install` | exits 0; `package-lock.json` written; `better-sqlite3` rebuilds without error |
| typecheck | `npm run type:check` | no errors |
| lint | `npm run lint` | no errors |
| unit + integration | `npm test` | all suites pass |
| db reset | `npm run db:reset` | migrate + seed both run; `data/app.db` rebuilt |
| dev server | `npm run dev` then `curl -sI http://localhost:3000` | `HTTP/1.1 200` |
| images download | `npm run images:download -- --only-missing` | exits 0; no fetch errors |
| build | `npm run build` | next build succeeds |
| e2e (optional, slow) | `npm run test:e2e:install` then `npm run test:e2e` | all specs pass |
| repo grep | `grep -rn "bun" --include="*.md" --include="*.json" --include="*.ts" --include="*.tsx" -l \| grep -v node_modules \| grep -v docs/plans \| grep -v docs/sprints \| grep -v PLAN.md` | only false-positives (`bundle` in `lib/sort.ts`, `bundler` in `tsconfig.json`) |

## Risks & Mitigations

- **`images:download` top-level await** — addressed in Change 3 by rewriting
  to `main().catch(...)`. No remaining gamble on Node module-detection.
- **Native rebuild slower** — first `npm install` rebuilds `better-sqlite3`
  from source. One-time cost, ~30–60s.
- **Lockfile churn** — fresh `package-lock.json` is large (hundreds of KB).
  Expected; commit.
- **Teammate machines with bun-only setups** — anyone pulling this branch
  must `rm -rf node_modules` and `npm install`. Mention in the commit body.
- **CI not in repo** — no `.github/workflows/` present, no CI pipeline to
  update. Confirmed via `ls .github` (directory does not exist).

## Out-of-Scope (do not touch)

- `docs/plans/wk*-impl.md`, `docs/plans/week-*.plan.md`,
  `docs/plans/playwright-tests.plan.md` — historical sprint/design plans.
- `docs/sprints/week-*.md` — sprint records.
- `PLAN.md` (root) — implementation diary; treat as historical.
- `lib/sort.ts:3` (`bundle`), `tsconfig.json:11` (`bundler`) — false
  positives.

## Review Trail

### Metis Plan Consultant
- [x] `PLAN.md` (root) — added to Out-of-Scope and verification grep
  exclusion (was missed; not under `docs/plans/`).
- [x] `docs/hands-on/01-feature.prompt.md`, `02-tests.prompt.md` — moved
  into scope; these are active runbooks, not history.
- [x] `scripts/download-seed-images.ts:93` top-level await — replaced
  with `main().catch(...)` so the script runs under bare `node`.
- [x] Verification grep updated: drop `docs/hands-on` exclusion (now in
  scope), add `PLAN.md` exclusion.
- [x] `docs/plans/playwright-tests.plan.md` — explicitly listed as
  historical, out of scope.

### Skipped (per user)
- Security Auditor — option d
- Architect Reviewer — option d

### Momus Plan Reviewer
- [x] All file paths verified exist at cited line numbers.
- [x] Every diff `-` line matches actual file content (Edit calls will
  apply cleanly).
- [x] Verification grep runs as written; residual hits match expectation
  (`lib/sort.ts`, `tsconfig.json` only).
- [x] Implementation order touches only files the plan declares.
- [x] No contradictions between sections.
- [x] Sibling-script claim verified: `node lib/db/migrate.ts` actually
  prints `migrations done` under Node 24, confirming `import.meta.main`
  pattern works without bun.
- Verdict: **OKAY** — ready to execute.
