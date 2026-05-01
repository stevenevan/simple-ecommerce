import { test, expect, request as playwrightRequest } from '@playwright/test'
import { resetDb } from '../fixtures/db'
import { registerUser } from '../fixtures/user'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
const OVER_LIMIT = 'x'.repeat(10_001)

const VALID_SHIPPING = {
  name: 'B',
  address: '1 St',
  city: 'C',
  zip: '12345',
}

test.beforeEach(async () => {
  await resetDb()
})

test('POST /api/orders oversize body → 413 (representative DoS guard)', async () => {
  const u = await registerUser('boundary-orderbig')
  const res = await u.context.post('/api/orders', {
    data: { ...VALID_SHIPPING, _pad: OVER_LIMIT },
  })
  expect(res.status()).toBe(413)
  await u.context.dispose()
})

test.describe('Unauth 401 — perimeter', () => {
  const cases: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }> = [
    { method: 'GET', path: '/api/cart' },
    { method: 'POST', path: '/api/cart/items', body: { productId: 1, quantity: 1 } },
    { method: 'POST', path: '/api/orders', body: VALID_SHIPPING },
    { method: 'GET', path: '/api/orders/1' },
  ]
  for (const c of cases) {
    test(`${c.method} ${c.path} → 401`, async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.fetch(c.path, {
        method: c.method,
        ...(c.body ? { data: c.body } : {}),
      })
      expect(res.status()).toBe(401)
      await ctx.dispose()
    })
  }
})

test('Tampered cookie on /api/cart → 401 (no 500)', async () => {
  const ctx = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Cookie: 'sec_session=garbage' },
  })
  const res = await ctx.get('/api/cart')
  expect(res.status()).toBe(401)
  await ctx.dispose()
})

test('Tampered cookie on /api/auth/me → 200 {user:null} (public-shape preserved)', async () => {
  const ctx = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Cookie: 'sec_session=garbage' },
  })
  const res = await ctx.get('/api/auth/me')
  expect(res.status()).toBe(200)
  expect(await res.json()).toEqual({ user: null })
  await ctx.dispose()
})

test('Cache-Control: no-store on authed /api/cart (private-data leak guard)', async () => {
  const u = await registerUser('cc-cart')
  const res = await u.context.get('/api/cart')
  expect(res.headers()['cache-control']).toContain('no-store')
  await u.context.dispose()
})

test('Cache-Control: no-store on 401 /api/cart (ensureSession path)', async () => {
  const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
  const res = await ctx.get('/api/cart')
  expect(res.status()).toBe(401)
  expect(res.headers()['cache-control']).toContain('no-store')
  await ctx.dispose()
})

test('CSRF non-vector — cross-origin text/plain to /api/orders never grants 200', async () => {
  const ctx = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Origin: 'https://evil.example' },
  })
  const res = await ctx.post('/api/orders', {
    headers: { 'Content-Type': 'text/plain' },
    data: 'name=B&address=1&city=C&zip=12345',
  })
  expect(res.status()).not.toBe(200)
  expect([400, 401]).toContain(res.status())
  await ctx.dispose()
})
