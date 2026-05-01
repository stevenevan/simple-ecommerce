// Client-side sort allowlist — URL/UI domain.
// Server-side counterpart is SORT_COLUMNS in lib/db/queries.ts (SQL ORDER BY allowlist).
// Keep arrays in sync; intentionally duplicated to keep better-sqlite3 out of the client bundle.
export const CLIENT_SORT_KEYS = ['newest', 'price_asc', 'price_desc', 'name_asc'] as const
export type ClientSortKey = (typeof CLIENT_SORT_KEYS)[number]

export function isClientSortKey(v: string | null | undefined): v is ClientSortKey {
  return !!v && (CLIENT_SORT_KEYS as readonly string[]).includes(v)
}
