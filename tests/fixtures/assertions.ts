// Workshop rule: describe what must NEVER appear in error bodies (deck page 04).
// Single source of truth so a rule change updates 3+ call sites at once.
//
// `expect` is injected: vitest 4.x and @playwright/test 1.59 ship distinct
// `Expect` types whose union TypeScript can't reliably narrow on .not.toMatch.
// Both runners implement the same jest-API surface at runtime, so we widen
// the parameter type and rely on the runtime contract.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function expectNoLeakageInBody(body: unknown, expect: any): void {
  expect(body).not.toHaveProperty('stack')
  const json = JSON.stringify(body)
  expect(json).not.toMatch(/sqlite|kysely|better-sqlite3|node_modules/i)
  expect(json).not.toMatch(/\bat\s.*\.[tj]sx?:\d+/)
  expect(json).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE)\s/)
  expect(json).not.toMatch(/SQLITE_[A-Z]+/)
}
