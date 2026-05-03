// Verify that all error responses (4xx/5xx) never leak internal details.
// Uses expectNoLeakageInBody from fixtures/assertions.ts.
// Covers: auth errors, cart errors, order errors, product 404.

import { test, expect, request as playwrightRequest } from '@playwright/test'
import { resetDb, insertCartItemDirect } from '../fixtures/db'
import { registerUser } from '../fixtures/user'
import { expectNoLeakageInBody } from '../fixtures/assertions'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'

test.beforeEach(async () => {
  await resetDb()
})

test.describe('error body leakage — auth', () => {
  test('401 on wrong credentials leaks nothing', async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
    const res = await ctx.post('/api/auth/login', {
      data: { email: 'nobody@example.com', password: 'WrongPass1!' },
    })
    expect(res.status()).toBe(401)
    const body = await res.json()
    expectNoLeakageInBody(body, expect)
    await ctx.dispose()
  })

  test('400 on invalid register body leaks nothing', async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
    const res = await ctx.post('/api/auth/register', {
      data: { email: 'bad', password: 'x', name: '' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expectNoLeakageInBody(body, expect)
    await ctx.dispose()
  })
})

test.describe('error body leakage — cart', () => {
  test('401 on unauthenticated cart access leaks nothing', async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
    const res = await ctx.get('/api/cart')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expectNoLeakageInBody(body, expect)
    await ctx.dispose()
  })

  test('404 on unknown product in cart add leaks nothing', async () => {
    const u = await registerUser('leak-cart-404')
    const res = await u.context.post('/api/cart/items', {
      data: { productId: 9999, quantity: 1 },
    })
    expect(res.status()).toBe(404)
    const body = await res.json()
    expectNoLeakageInBody(body, expect)
    await u.context.dispose()
  })

  test('409 on over-stock cart add leaks nothing', async () => {
    const u = await registerUser('leak-cart-409')
    const res = await u.context.post('/api/cart/items', {
      data: { productId: 1, quantity: 999 },
    })
    expect(res.status()).toBe(409)
    const body = await res.json()
    expectNoLeakageInBody(body, expect)
    await u.context.dispose()
  })

  test('400 on invalid quantity leaks nothing', async () => {
    const u = await registerUser('leak-cart-400')
    const res = await u.context.post('/api/cart/items', {
      data: { productId: 1, quantity: 0 },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expectNoLeakageInBody(body, expect)
    await u.context.dispose()
  })
})

test.describe('error body leakage — orders', () => {
  test('400 on empty cart order leaks nothing', async () => {
    const u = await registerUser('leak-order-empty')
    const res = await u.context.post('/api/orders', {
      data: { name: 'A', address: '1 St', city: 'C', zip: '12345' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expectNoLeakageInBody(body, expect)
    await u.context.dispose()
  })

  test('409 on insufficient stock order leaks nothing', async () => {
    const u = await registerUser('leak-order-stock')
    // Insert cart item directly bypassing stock check (product:2 has stock=1)
    await insertCartItemDirect(u.userId, 2, 5)
    const res = await u.context.post('/api/orders', {
      data: { name: 'A', address: '1 St', city: 'C', zip: '12345' },
    })
    expect(res.status()).toBe(409)
    const body = await res.json()
    expectNoLeakageInBody(body, expect)
    await u.context.dispose()
  })

  test('400 on invalid shipping schema leaks nothing', async () => {
    const u = await registerUser('leak-order-schema')
    await u.context.post('/api/cart/items', { data: { productId: 1, quantity: 1 } })
    const res = await u.context.post('/api/orders', {
      data: { name: '', address: '', city: '', zip: 'abc' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expectNoLeakageInBody(body, expect)
    await u.context.dispose()
  })

  test('404 on nonexistent order detail leaks nothing', async () => {
    const u = await registerUser('leak-order-404')
    const res = await u.context.get('/api/orders/99999')
    expect(res.status()).toBe(404)
    const body = await res.json()
    expectNoLeakageInBody(body, expect)
    await u.context.dispose()
  })
})

test.describe('error body leakage — products', () => {
  test('404 on nonexistent product slug leaks nothing', async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
    const res = await ctx.get('/api/products/nonexistent-slug-xyz')
    expect(res.status()).toBe(404)
    const body = await res.json()
    expectNoLeakageInBody(body, expect)
    await ctx.dispose()
  })
})
