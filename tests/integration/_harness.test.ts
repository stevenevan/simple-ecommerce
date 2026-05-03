// Meta-test for the test harness itself. Runs first to fail fast if the
// vitest config / setup wiring breaks.
//
//   (a) cold-imports @/lib/session — proves env vars are set early enough
//       that lib/session.ts's SESSION_SECRET length check passes
//   (b) runs setupDb + truncateAll across test cases — proves DB is
//       readable, schema is present, and truncate clears state
//   (c) grep gate: no production module outside lib/session.ts imports
//       next/headers directly — protects the session-mock contract from
//       silent regression when new routes are added

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { setupDb, truncateAll, seedProduct } from '../setup/db'

const REPO_ROOT = path.resolve(__dirname, '../..')

beforeAll(() => {
  setupDb()
})

beforeEach(async () => {
  await truncateAll()
})

describe('harness', () => {
  it('lib/session imports without throwing (SESSION_SECRET wiring works)', async () => {
    const mod = await import('@/lib/session')
    expect(typeof mod.getSession).toBe('function')
  })

  it('setupDb + truncateAll: rows from one test do not leak to next', async () => {
    const a = await seedProduct({ slug: 'harness-a' })
    expect(a.id).toBeGreaterThan(0)
    // truncateAll runs in beforeEach of the NEXT it; this test verifies
    // the seed worked. The next assertion validates the cross-test reset.
  })

  it('subsequent test starts with a clean products table', async () => {
    const { kdb } = await import('@/lib/db/kysely')
    const rows = await kdb.selectFrom('products').selectAll().execute()
    expect(rows).toEqual([])
  })

  it('grep gate: no production code imports next/headers outside lib/session.ts', () => {
    const offenders: string[] = []
    walk(path.join(REPO_ROOT, 'app'), offenders)
    walk(path.join(REPO_ROOT, 'lib'), offenders)
    const filtered = offenders.filter(
      (p) =>
        !p.replace(/\\/g, '/').endsWith('/lib/session.ts') &&
        !p.replace(/\\/g, '/').endsWith('/lib/session.tsx'),
    )
    expect(filtered).toEqual([])
  })
})

function walk(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry)
    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      walk(full, out)
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      const src = readFileSync(full, 'utf8')
      if (/from\s+['"]next\/headers['"]/.test(src)) {
        out.push(full)
      }
    }
  }
}
