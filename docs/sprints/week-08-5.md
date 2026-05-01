# Week 8.5 — Kysely Backfill (Wk 1–6 helpers)

## Goals

Convert all remaining raw `better-sqlite3` query helpers in `lib/db/queries.ts` to Kysely so the DB layer is uniform end-to-end. Eliminates the Wk 7+8-vs-everything-else hybrid noted in `docs/plans/wk7-wk8-impl.md` §9 and the README hand-off "Known limitations" block.

End of sprint = `lib/db/queries.ts` contains zero `getDb().prepare(...)` calls; every helper is async (`Promise<T>`); every consumer route handler / server component awaits.

## Dependencies (from prior weeks) — ALL HARD PREREQS

- Wk 7A: `lib/db/kysely.ts` exporting `kdb: Kysely<Database>` with full schema-typed `Database` interface.
- Wk 7+8: cart + order helpers already async; the async-helper pattern is established.
- Wk 4.5 / Wk 6: `lib/schemas/auth.ts` (`registerSchema`, `loginSchema`); `ensureSession`.

## Pre-flight reading

- `https://kysely.dev/docs/queries/select` — `selectFrom`, `select`, `where`, `orderBy`, dynamic WHERE composition with `eb`/`exists`/`expressionBuilder`.
- `https://kysely.dev/docs/queries/insert` — `insertInto(...).values(...).returning(...)` for the `insertUser` rewrite.
- `https://kysely.dev/docs/recipes/raw-sql` — `sql` template tag (will be needed for the `LIKE … ESCAPE '\'` clause and the `name COLLATE NOCASE ASC` order key in `listProducts`).

## In-scope tasks

1. **Convert five sync helpers in `lib/db/queries.ts` to async Kysely:**
   - `listProducts(filter): Promise<Product[]>` — composable `where('category', '=', ...)` and `where('name', 'like', sql\`...\`)` clauses; ORDER BY built from `SORT_COLUMNS` (preserve `name COLLATE NOCASE ASC` semantics — use `sql.ref('name').collate('nocase').asc()` or fall back to a `sql\`name COLLATE NOCASE ASC\`` raw fragment if the typed builder doesn't expose `COLLATE`); LIMIT/OFFSET; same SQL-LIKE escape rules (escape `\`, `%`, `_` then wrap with `%…%` and `ESCAPE '\'`).
   - `getProductBySlug(slug): Promise<Product | null>` — `selectAll().where('slug', '=', ?).executeTakeFirst()`.
   - `listCategories(): Promise<string[]>` — `selectFrom('products').select('category').distinct().orderBy('category').execute().then(rs => rs.map(r => r.category))`.
   - `getUserByEmail(email): Promise<UserRow | null>` — `selectAll().where('email', '=', ?).executeTakeFirst()`.
   - `insertUser(email, passwordHash, name): Promise<{ id: number }>` — `insertInto('users').values({...}).returning('id').executeTakeFirstOrThrow()`.

2. **Drop the `getProductBySlugStmt` / `listCategoriesStmt` / `getUserByEmailStmt` / `insertUserStmt` prepare-cache wrappers** — Kysely caches its own compiled SQL; the closures are dead code post-conversion.

3. **Drop the `SORT_COLUMNS` raw-SQL map** in favor of a typed key→Kysely-orderBy mapping. Replacement shape:
   ```ts
   const SORT: Record<SortKey, (qb) => qb> = {
     price_asc:  (qb) => qb.orderBy('price_cents', 'asc'),
     price_desc: (qb) => qb.orderBy('price_cents', 'desc'),
     name_asc:   (qb) => qb.orderBy(sql`name COLLATE NOCASE`, 'asc'),
     newest:     (qb) => qb.orderBy('created_at', 'desc'),
   } as const
   ```
   `SortKey` typing stays the same (`keyof typeof SORT`); `SORT_COLUMNS` export is removed (verify nothing outside `queries.ts` imports it — `grep -rn "SORT_COLUMNS" app lib components` should be empty after the change).

4. **Update every caller to `await`:**
   - `app/api/products/route.ts` — `await listProducts(...)`.
   - `app/api/products/[slug]/route.ts` — `await getProductBySlug(...)`.
   - `app/api/products/categories/route.ts` — `await listCategories()`.
   - `app/products/[slug]/page.tsx` — `await getProductBySlug(...)` (already an async server component).
   - `app/api/auth/login/route.ts` — `await getUserByEmail(...)`.
   - `app/api/auth/register/route.ts` — `await getUserByEmail(...)` and `await insertUser(...)`.

5. **`lib/db/seed.ts` is OUT OF SCOPE.** Seed uses raw `db.prepare` directly (does not import from `queries.ts`); it's a one-shot CLI script, not a runtime helper. Leave as-is. Add a leading comment in `seed.ts` flagging this if re-runs surface confusion: `// Raw better-sqlite3 by design — one-shot CLI; no need for Kysely indirection here.`

6. **Update `lib/db/queries.ts` leading comment** from:
   > `// Wk1-6 helpers stay sync (raw better-sqlite3 prepares).`
   > `// Wk7+8 helpers are async (Kysely via lib/db/kysely.ts).`
   > `// Backfill of Wk1-6 to Kysely is a future follow-up.`
   to a single line:
   > `// All helpers async (Kysely via lib/db/kysely.ts).`

7. **Update `README.md` Known limitations block** — remove the bullet `"DB layer is hybrid: Wk 7+8 helpers use Kysely; Wk 1–6 helpers still use raw better-sqlite3 prepared statements. Backfill is a future follow-up."`.

8. **Update `docs/plans/wk7-wk8-impl.md` §9** — strike through the "(Kysely hybrid — user-elected path b)" decision line OR add a postscript: `**STATUS:** hybrid resolved by Wk 8.5 backfill (commit <sha>).` Either is fine; keep audit trail.

## Out-of-scope

- No schema migrations (no new tables, no new columns).
- No new endpoints or UI.
- No `seed.ts` rewrite (see §5).
- No further refactors to `kysely.ts` (Database interface is already complete from Wk 7A).
- No performance work — `listProducts` performance characteristics are unchanged (single SELECT with one optional WHERE join).

## Manual QA checklist

The Wk 1–6 + Wk 7–8 manual QA scenarios all still need to pass after the conversion. Re-run the **golden path** end-to-end:

- [ ] `bun run db:reset && bun dev`. Home page loads with 20 products. Category filter, sort dropdown (price asc/desc, name, newest), and search box all work. Verify `name_asc` sort still uses `COLLATE NOCASE` (mixed-case product names sort case-insensitively — easiest check: temporarily seed two products with names `apple` and `Banana`, confirm `apple` comes before `Banana` under name_asc, then revert the seed).
- [ ] Product detail page (`/products/<slug>`) loads.
- [ ] Register a new user, then log in. Both flows should still 200 and set the cookie.
- [ ] Existing demo login (`demo@example.com` / `Demo1234!`) still works.
- [ ] Add 2 items → checkout → `/checkout/success/<id>` → `/orders` (Wk 7+8 happy path); confirms the converted Wk1–6 helpers and the Wk7+8 helpers still co-operate inside the same Kysely connection.
- [ ] Body-cap + bad-zip + cross-user 404 cases on order endpoints unchanged.
- [ ] `bun run type:check` clean. `bun run lint` clean. No new files created in `lib/db/` (kysely.ts unchanged).
- [ ] `grep -n "getDb().prepare" lib/db/queries.ts` returns ZERO matches.
- [ ] `grep -n "SORT_COLUMNS" app lib components` returns ZERO matches.

## Exit criteria

- `lib/db/queries.ts` contains no `getDb().prepare(...)` calls.
- All five Wk1–6 helpers return `Promise<T>`; signatures match the table in §1.
- All six caller files (§4) await the helpers; type-check passes without `as` casts.
- `SORT_COLUMNS` export removed; nothing imports it.
- Hand-off README + plan doc reflect the resolved hybrid (no stale "follow-up" notes).
- Golden path end-to-end (browse → cart → checkout → orders) passes in the browser.

## Transition

DB layer is uniform. Future evolutions (real payments, order statuses, admin views, e2e activation, multi-tenant) can assume one query API.
