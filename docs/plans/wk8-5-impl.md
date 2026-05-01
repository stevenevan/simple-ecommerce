# Wk 8.5 Impl Plan — Kysely Backfill

Source sprint: `docs/sprints/week-08-5.md`. End state: zero `getDb().prepare(...)` in `lib/db/queries.ts`; every helper async; every caller awaits.

## Scope freeze

- Touch `lib/db/queries.ts` and 6 caller files only (Phase 1).
- Touch `README.md`, `docs/plans/wk7-wk8-impl.md`, `lib/db/queries.ts` header comment, `lib/sort.ts` cross-ref comment, `lib/db/seed.ts` (one comment) only (Phase 2).
- No schema work, no new endpoints, no UI, no `seed.ts` rewrite, no `kysely.ts` change.
- **Non-goal — single SQLite connection invariant.** `kdb` already wraps the same `getDb()` (`lib/db/kysely.ts:69`); this sprint must NOT introduce a second `Kysely` instance, a second `BetterSqlite3Dialect`, or a parallel migration runner. The whole hybrid-resolution argument rests on this — see `docs/plans/wk7-wk8-impl.md` §9 (line 930).

## Phase 1 — Convert helpers + drop SORT_COLUMNS

### 1.1 Rewrite `lib/db/queries.ts` Wk1–6 helpers

**Default to inline `switch` for sort order; do not build a typed callback map.** Sprint §3 shows a callback map but the generic constraints needed to satisfy Kysely's chained-builder typing collapse to `any`, giving no real safety over a 4-arm switch. Switch is simpler, deletes `SORT_COLUMNS`, and is the YAGNI win. Only reach for a callback map if the switch causes a TS error during impl.

```ts
type SortKey = 'price_asc' | 'price_desc' | 'name_asc' | 'newest'
export type { SortKey }
```

`listProducts(filter)` becomes:

```ts
export async function listProducts(filter: ListProductsFilter): Promise<Product[]> {
  const sortKey: SortKey =
    filter.sort === 'price_asc' || filter.sort === 'price_desc' ||
    filter.sort === 'name_asc' || filter.sort === 'newest'
      ? filter.sort
      : 'newest'

  let qb = kdb.selectFrom('products').selectAll()

  if (filter.category) qb = qb.where('category', '=', filter.category)

  if (filter.q) {
    const escaped = filter.q
      .replaceAll('\\', '\\\\')
      .replaceAll('%', '\\%')
      .replaceAll('_', '\\_')
    const pattern = `%${escaped}%`
    // LIKE … ESCAPE '\' — pattern stays parameterised; the ESCAPE clause is a literal SQL tail.
    qb = qb.where(sql`name LIKE ${pattern} ESCAPE '\\'`)
  }

  switch (sortKey) {
    case 'price_asc':  qb = qb.orderBy('price_cents', 'asc'); break
    case 'price_desc': qb = qb.orderBy('price_cents', 'desc'); break
    case 'name_asc':   qb = qb.orderBy(sql`name COLLATE NOCASE`, 'asc'); break
    case 'newest':     qb = qb.orderBy('created_at', 'desc'); break
  }

  return qb.limit(filter.limit).offset(filter.offset).execute()
}
```

LIKE-ESCAPE shape rationale: passing `sql\`name LIKE ${pattern} ESCAPE '\\'\`` as a single `where()` raw expression keeps `pattern` as a bound parameter (Kysely interpolates `${pattern}` as a parameter, not an inline literal) while keeping `ESCAPE '\'` as a literal SQL tail. The earlier alternative — `where('name','like', sql\`${pattern} ESCAPE '\\'\`)` — passes `ESCAPE '\\'` as part of the value side, which Kysely may render as `name LIKE ? ESCAPE '\\'` with `?` bound to the **whole** thing including the suffix. Use the single-fragment form. Verify once during impl with `qb.compile()` and assert the SQL contains exactly one `?` and the literal `ESCAPE '\\'` tail.

The trailing newest-fallback existed in the previous implementation (`SORT_COLUMNS[filter.sort as SortKey] ?? SORT_COLUMNS.newest`); the switch preserves it via the narrow-typed `sortKey` initializer.

`getProductBySlug`, `listCategories`, `getUserByEmail`, `insertUser`:

```ts
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const row = await kdb.selectFrom('products').selectAll().where('slug', '=', slug).executeTakeFirst()
  return row ?? null
}

export async function listCategories(): Promise<string[]> {
  const rows = await kdb.selectFrom('products').select('category').distinct().orderBy('category').execute()
  return rows.map((r) => r.category)
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const row = await kdb.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst()
  return (row ?? null) as UserRow | null
}

export async function insertUser(email: string, passwordHash: string, name: string): Promise<{ id: number }> {
  return kdb
    .insertInto('users')
    .values({ email, password_hash: passwordHash, name })
    .returning('id')
    .executeTakeFirstOrThrow()
}
```

Drop the `getProductBySlugStmt`, `listCategoriesStmt`, `getUserByEmailStmt`, `insertUserStmt` closures and the `getDb` import (verify no other uses left in the file before removing the import).

### 1.2 Caller awaits — six files

| File | Change |
|------|--------|
| `app/api/products/route.ts:25` | `await listProducts(...)` |
| `app/api/products/[slug]/route.ts:12` | `await getProductBySlug(slug)` |
| `app/api/products/categories/route.ts:7-8` | handler is **already** `async GET()`; only add `await` before `listCategories()` |
| `app/products/[slug]/page.tsx:13` | `await getProductBySlug(slug)` (already async) |
| `app/api/auth/login/route.ts:34` | `await getUserByEmail(email)` |
| `app/api/auth/register/route.ts:37,41` | `await getUserByEmail(...)` and `await insertUser(...)` |

`categories/route.ts` is the only signature change (sync → async); the rest are already async handlers.

### 1.3 Verify
- `bun run type:check` clean.
- `bun run lint` clean.
- `grep -n "getDb().prepare" lib/db/queries.ts` → 0 matches.
- `grep -rn "SORT_COLUMNS" app lib components` → 0 matches.
- `grep -rn "getProductBySlugStmt\|listCategoriesStmt\|getUserByEmailStmt\|insertUserStmt" lib app` → 0 matches.

### 1.4 Manual QA (golden path)
- `bun run db:reset && bun dev`. Home page → 20 products.
- Category filter, sort (all four), search → all return rows.
- `name_asc` case-insensitive: spot-check the seed dataset; if no mixed-case names exist, run an ad-hoc `sqlite3` query against `data/app.db` (`SELECT name FROM products ORDER BY name COLLATE NOCASE LIMIT 5`) and compare against the API result for `?sort=name_asc`. Do not modify seed.
- Product detail (`/products/<slug>`) loads.
- Register new user → log in → cookie set.
- Demo creds (`demo@example.com` / `Demo1234!`) still 200.
- Add 2 items → checkout → `/checkout/success/<id>` → `/orders`.
- Body-cap (oversized POST), bad-zip, cross-user 404 still match Wk 7+8 behavior.

## Phase 2 — Doc + comment cleanup

### 2.1 `lib/db/queries.ts` header
Replace the 4-line preamble (lines 2–4) with the single line:

```ts
// All helpers async (Kysely via lib/db/kysely.ts).
```

### 2.2 `README.md:24`
Delete the bullet:
> `DB layer is hybrid: Wk 7+8 helpers use Kysely; Wk 1–6 helpers still use raw better-sqlite3 prepared statements. Backfill is a future follow-up.`

### 2.3 `docs/plans/wk7-wk8-impl.md` §9 (line 930)
Append postscript to the `(Kysely hybrid — user-elected path b)` bullet:
> `**STATUS:** hybrid resolved by Wk 8.5 backfill (commit <sha>).`

`<sha>` = the Phase 1 commit SHA (capture from `git rev-parse --short HEAD` after Phase 1 commit lands; the Phase 2 commit edits this file with the now-known SHA).

### 2.4 `lib/sort.ts` comment refresh

`lib/sort.ts:2` currently reads:
> `// Server-side counterpart is SORT_COLUMNS in lib/db/queries.ts (SQL ORDER BY allowlist).`

After Phase 1 deletes `SORT_COLUMNS`, this comment is stale. Replace line 2 with:
> `// Server-side ORDER BY allowlist is the inline switch in listProducts (lib/db/queries.ts).`

Line 3 (`Keep arrays in sync; intentionally duplicated to keep better-sqlite3 out of the client bundle.`) stays — the bundle-isolation rationale is still load-bearing.

### 2.5 `lib/db/seed.ts`
Add one comment immediately above the first `db.prepare(...)` invocation (the existing `insertUser` raw-prepare at the top of the seed body):

```ts
// Raw better-sqlite3 by design — one-shot CLI; no need for Kysely indirection here.
```

### 2.6 Verify
- `bun run type:check` clean.
- `bun run lint` clean.
- `grep -rn "hybrid" README.md docs/plans/wk7-wk8-impl.md` returns only the §9 postscript line, nothing else stale.
- `grep -rn "SORT_COLUMNS" lib app components` → 0 matches (incl. comments).
- `grep -rnw "SortKey" lib app components` → matches only inside `lib/db/queries.ts`. (Word-boundary `-w` is required — without it, the grep will also match `ClientSortKey` in `lib/sort.ts`, `lib/types.ts`, `app/ProductGrid.tsx`, `components/FilterBar.tsx`, which is intentional and unrelated.)

### 2.7 Phase ordering guard
Phase 2 commit must follow Phase 1 commit so the `<sha>` substituted in §2.3 is stable. Do not stage Phase 2 edits until Phase 1 has landed cleanly (type:check + lint green, committed). Capture the SHA via `git rev-parse --short HEAD` immediately after the Phase 1 commit and substitute it into the postscript before staging Phase 2.

## Out of scope (do not touch)
- `lib/db/seed.ts` body (only the comment in §2.4).
- `lib/db/kysely.ts` (Database interface stays).
- `lib/db/index.ts`.
- `lib/sort.ts` (`CLIENT_SORT_KEYS` is the URL/UI allowlist; it does **not** import `SORT_COLUMNS` and stays untouched).
- Any new endpoints, schemas, or UI.

## Commits — caveman-commit style (one per phase)

Phase 1 subject candidate: `refactor(db): kysely backfill wk1-6 helpers`
Phase 2 subject candidate: `docs(db): drop hybrid notes; flag seed`

Body only when "why" non-obvious. Conventional Commits, ≤50-char subject.

## Risk surface

- **LIKE-ESCAPE drift.** Raw fragment must keep `ESCAPE '\'` reaching SQLite. Spot-check via `.compile()`.
- **`name COLLATE NOCASE` order key.** `sql\`name COLLATE NOCASE\`` works at runtime; Kysely's typed `orderBy` accepts an `Expression`. If TS rejects, downgrade to `orderBy(sql\`name COLLATE NOCASE ASC\`)` (no second arg).
- **`UserRow` cast on `selectAll`.** Kysely's `selectAll()` on `users` resolves `Generated<number>`/`Generated<string>` to `number`/`string` on read (matches `UserRow`). Try without the cast first; only fall back to `as UserRow | null` if TS rejects. Same applies to `insertUser` returning `{ id: number }` — `Generated<number>.id` resolves to `number` post-`returning`, so the explicit `Number(...)` wrap from the prior impl drops.
- **`categories/route.ts`** is already `async` — Phase 1 only adds `await`. No signature change.
- **No double connection.** `kdb` already wraps the same `getDb()`. Phase 1 does not introduce a new connection.

## Review Trail

### Metis Plan Consultant
- [x] F1 — `lib/sort.ts:2` comment added to Phase 2 cleanup (§2.4).
- [x] F2 — LIKE-ESCAPE rewritten as single-fragment `sql\`name LIKE ${pattern} ESCAPE '\\'\`` with compile() spot-check (§1.1).
- [x] F3 — Default to inline `switch`; callback map is fallback only (§1.1).
- [x] F4 — Drop unnecessary `Number(...)` wrap on `insertUser`; try sans cast on `getUserByEmail` first (Risk surface).
- [x] F5 — `categories/route.ts` already async; table corrected (§1.2).
- [x] F6 — Phase 2 ordering guard added (§2.7).

### Architect Reviewer
Verdict: APPROVE.
- [x] A1 — Server-only boundary preserved (no client `SortKey` import).
- [x] A2 — Pattern consistency with Wk 7+8 idioms confirmed.
- [x] A3 — Single-connection invariant promoted from risk surface to Scope freeze non-goal.
- [x] A4 — Two-commit phase decomposition is correct (Phase 2 needs stable Phase 1 SHA).
- [x] A5 — `UserRow` reuse and `insertUser` `{ id: number }` shape clean; cast-only-if-needed strategy retained.
- [x] A6 — Added `grep -rn "SortKey"` verify step (§2.6).

### Security Auditor
Verdict: APPROVE.
- [x] S1 (INFO) — `sql\`name LIKE ${pattern} ESCAPE '\\'\`` parameterises `pattern`; compile() spot-check covers it.
- [x] S2 (INFO) — Login timing equalisation (`DUMMY_HASH` vs real hash) preserved post-await.
- [x] S3 (INFO) — Register hashes before existence check; ordering preserved post-await.
- [x] S4 (INFO) — No new error responses; `executeTakeFirstOrThrow` failure surfaces as generic 500 (same as `.run()` today).
- [x] S5 (INFO) — `/products/<slug>` no-store + cross-account semantics unchanged.
- [x] S6 (INFO) — No new secrets, env vars, or trust-boundary moves.
- [x] S7 (INFO) — `UserRow` cast fallback safe either way.

### Momus Plan Reviewer
Verdict: APPROVE.
- [x] All file paths, line numbers, and quoted strings verified against the working tree.
- [x] §2.6 grep tightened to `grep -rnw "SortKey"` to skip `ClientSortKey` collisions.
- [x] §2.5 anchor sharpened: comment goes immediately above the first `db.prepare(...)` in `seed.ts`.
- [x] Risk-surface bullet on `categories/route.ts` corrected (already async; `await`-only edit).
