// SQLi probes against `q` filter on /api/products.
// Regression-protects the LIKE-escape in lib/db/queries.ts:39-44.
// Category filter dropped — exact-match Kysely is lower risk than LIKE.

import { test, expect, request as playwrightRequest } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'

// 4 representative probes:
//  '%'           — wildcard escape regression
//  "'"           — quote-break regression on parameterization
//  "' OR 1=1--"  — classic SQLi
//  '100%'        — literal-substring vs wildcard semantics
const PROBES = ['%', "'", "' OR 1=1--", '100%']

for (const probe of PROBES) {
  test(`q=${JSON.stringify(probe)} → 200, empty`, async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
    const res = await ctx.get(`/api/products?q=${encodeURIComponent(probe)}`)
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual([])
    await ctx.dispose()
  })
}
