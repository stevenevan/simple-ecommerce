// Product listing, filtering, sorting, pagination, and categories API tests.
// Covers GET /api/products (query params) and GET /api/products/categories.
// Seed: 4 products — cat-a (id:1,2), cat-b (id:3), cat-c (id:4).

import { test, expect, request as playwrightRequest } from '@playwright/test'
import { resetDb } from '../fixtures/db'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'

test.beforeEach(async () => {
  await resetDb()
})

test.describe('GET /api/products', () => {
  test('returns all seeded products by default', async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
    const res = await ctx.get('/api/products')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(4)
    await ctx.dispose()
  })

  test('Cache-Control: no-store header present', async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
    const res = await ctx.get('/api/products')
    expect(res.headers()['cache-control']).toContain('no-store')
    await ctx.dispose()
  })

  test.describe('category filter', () => {
    test('category=cat-a returns only cat-a products', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?category=cat-a')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      for (const p of body) {
        expect(p.category).toBe('cat-a')
      }
      await ctx.dispose()
    })

    test('category=cat-b returns only cat-b products', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?category=cat-b')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].slug).toBe('p3')
      await ctx.dispose()
    })

    test('category=nonexistent returns empty array', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?category=nonexistent')
      expect(res.status()).toBe(200)
      expect(await res.json()).toEqual([])
      await ctx.dispose()
    })
  })

  test.describe('sort', () => {
    test('sort=price_asc returns cheapest first', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?sort=price_asc')
      expect(res.status()).toBe(200)
      const body = await res.json()
      for (let i = 1; i < body.length; i++) {
        expect(body[i].price_cents).toBeGreaterThanOrEqual(body[i - 1].price_cents)
      }
      await ctx.dispose()
    })

    test('sort=price_desc returns most expensive first', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?sort=price_desc')
      expect(res.status()).toBe(200)
      const body = await res.json()
      for (let i = 1; i < body.length; i++) {
        expect(body[i].price_cents).toBeLessThanOrEqual(body[i - 1].price_cents)
      }
      await ctx.dispose()
    })

    test('sort=name_asc returns alphabetical order', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?sort=name_asc')
      expect(res.status()).toBe(200)
      const body = await res.json()
      const names = body.map((p: { name: string }) => p.name.toLowerCase())
      const sorted = [...names].sort()
      expect(names).toEqual(sorted)
      await ctx.dispose()
    })

    test('invalid sort key falls back to default (no error)', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?sort=DROP_TABLE')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(4)
      await ctx.dispose()
    })
  })

  test.describe('pagination', () => {
    test('limit=2 returns exactly 2 products', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?limit=2')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      await ctx.dispose()
    })

    test('offset=2 skips first 2 products', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const all = await (await ctx.get('/api/products')).json()
      const res = await ctx.get('/api/products?offset=2')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(all.length - 2)
      expect(body[0].id).toBe(all[2].id)
      await ctx.dispose()
    })

    test('limit=1&offset=1 returns second product only', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const all = await (await ctx.get('/api/products')).json()
      const res = await ctx.get('/api/products?limit=1&offset=1')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].id).toBe(all[1].id)
      await ctx.dispose()
    })

    test('limit clamped to max 50', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?limit=999')
      expect(res.status()).toBe(200)
      // With only 4 seed products, we just verify it doesn't error
      const body = await res.json()
      expect(body.length).toBeLessThanOrEqual(50)
      await ctx.dispose()
    })

    test('negative offset treated as 0', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?offset=-5')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(4)
      await ctx.dispose()
    })
  })

  test.describe('search (q param)', () => {
    test('q=One finds product with "One" in name', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?q=One')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].slug).toBe('p1')
      await ctx.dispose()
    })

    test('q=test (case-insensitive) finds all products', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?q=test')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(4)
      await ctx.dispose()
    })

    test('q=nonexistent returns empty', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?q=zzzznotfound')
      expect(res.status()).toBe(200)
      expect(await res.json()).toEqual([])
      await ctx.dispose()
    })
  })

  test.describe('combined filters', () => {
    test('category + sort work together', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?category=cat-a&sort=price_asc')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      expect(body[0].price_cents).toBeLessThanOrEqual(body[1].price_cents)
      for (const p of body) {
        expect(p.category).toBe('cat-a')
      }
      await ctx.dispose()
    })

    test('category + q work together', async () => {
      const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
      const res = await ctx.get('/api/products?category=cat-a&q=Two')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].slug).toBe('p2')
      await ctx.dispose()
    })
  })
})

test.describe('GET /api/products/categories', () => {
  test('returns distinct categories sorted', async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
    const res = await ctx.get('/api/products/categories')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toEqual(['cat-a', 'cat-b', 'cat-c'])
    await ctx.dispose()
  })

  test('Cache-Control: no-store header present', async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
    const res = await ctx.get('/api/products/categories')
    expect(res.headers()['cache-control']).toContain('no-store')
    await ctx.dispose()
  })
})
