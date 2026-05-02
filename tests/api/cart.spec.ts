import { test, expect } from '@playwright/test'
import { resetDb } from '../fixtures/db'
import { registerUser } from '../fixtures/user'
import { expectNoLeakageInBody } from '../fixtures/assertions'

test.beforeEach(async () => {
  await resetDb()
})

test.describe('POST /api/cart/items', () => {
  test('add then GET cart shows line + correct subtotal', async () => {
    const u = await registerUser('cart-add')
    const post = await u.context.post('/api/cart/items', {
      data: { productId: 1, quantity: 2 },
    })
    expect(post.status()).toBe(200)
    const cart = await u.context.get('/api/cart')
    expect(cart.status()).toBe(200)
    const body = await cart.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ productId: 1, quantity: 2 })
    expect(body.subtotalCents).toBe(2000) // 1000 * 2
    await u.context.dispose()
  })

  test('upsert merges quantity on repeated add', async () => {
    const u = await registerUser('cart-upsert')
    await u.context.post('/api/cart/items', { data: { productId: 1, quantity: 2 } })
    await u.context.post('/api/cart/items', { data: { productId: 1, quantity: 2 } })
    const cart = await (await u.context.get('/api/cart')).json()
    expect(cart.items[0].quantity).toBe(4)
    await u.context.dispose()
  })

  test('boundary pass: existing 4 + new 1 = stock 5 → 200', async () => {
    const u = await registerUser('cart-boundary')
    await u.context.post('/api/cart/items', { data: { productId: 1, quantity: 4 } })
    const last = await u.context.post('/api/cart/items', { data: { productId: 1, quantity: 1 } })
    expect(last.status()).toBe(200)
    await u.context.dispose()
  })

  test('over-stock total → 409 insufficient_stock', async () => {
    const u = await registerUser('cart-overstock')
    await u.context.post('/api/cart/items', { data: { productId: 1, quantity: 4 } })
    const over = await u.context.post('/api/cart/items', { data: { productId: 1, quantity: 2 } })
    expect(over.status()).toBe(409)
    const body = await over.json()
    expect(body.error).toBe('insufficient_stock')
    // Negative contract (workshop rule: describe what must never happen).
    expectNoLeakageInBody(body, expect)
    await u.context.dispose()
  })

  test('zero-stock product → 409', async () => {
    const u = await registerUser('cart-zerostock')
    const res = await u.context.post('/api/cart/items', { data: { productId: 3, quantity: 1 } })
    expect(res.status()).toBe(409)
    await u.context.dispose()
  })

  test('unknown productId → 404', async () => {
    const u = await registerUser('cart-unknownp')
    const res = await u.context.post('/api/cart/items', { data: { productId: 99999, quantity: 1 } })
    expect(res.status()).toBe(404)
    await u.context.dispose()
  })

  test('invalid quantity (representative: zero) → 400', async () => {
    const u = await registerUser('cart-invalid-qty')
    const res = await u.context.post('/api/cart/items', {
      data: { productId: 1, quantity: 0 },
    })
    expect(res.status()).toBe(400)
    await u.context.dispose()
  })

  test('quantity > MAX_QUANTITY (1000) → 400', async () => {
    const u = await registerUser('cart-maxqty')
    const res = await u.context.post('/api/cart/items', { data: { productId: 1, quantity: 1000 } })
    expect(res.status()).toBe(400)
    await u.context.dispose()
  })
})

test.describe('PATCH /api/cart/items/[id]', () => {
  async function seedItem(suffix: string) {
    const u = await registerUser(suffix)
    await u.context.post('/api/cart/items', { data: { productId: 1, quantity: 1 } })
    const cart = await (await u.context.get('/api/cart')).json()
    return { user: u, itemId: cart.items[0].id as number }
  }

  test('qty over stock → 409', async () => {
    const { user, itemId } = await seedItem('patch-over')
    const res = await user.context.patch(`/api/cart/items/${itemId}`, {
      data: { quantity: 6 },
    })
    expect(res.status()).toBe(409)
    await user.context.dispose()
  })

  test('IDOR — userB PATCH userA line → 404', async () => {
    const { user: userA, itemId } = await seedItem('patch-idor-a')
    const userB = await registerUser('patch-idor-b')
    const res = await userB.context.patch(`/api/cart/items/${itemId}`, {
      data: { quantity: 1 },
    })
    expect(res.status()).toBe(404)
    await userA.context.dispose()
    await userB.context.dispose()
  })

  test('non-existent itemId → 404', async () => {
    const u = await registerUser('patch-noitem')
    const res = await u.context.patch('/api/cart/items/99999', { data: { quantity: 1 } })
    expect(res.status()).toBe(404)
    await u.context.dispose()
  })
})

test.describe('DELETE /api/cart/items/[id]', () => {
  async function seedItem(suffix: string) {
    const u = await registerUser(suffix)
    await u.context.post('/api/cart/items', { data: { productId: 1, quantity: 1 } })
    const cart = await (await u.context.get('/api/cart')).json()
    return { user: u, itemId: cart.items[0].id as number }
  }

  test('IDOR — userB DELETE userA line → 404', async () => {
    const { user: userA, itemId } = await seedItem('del-idor-a')
    const userB = await registerUser('del-idor-b')
    const res = await userB.context.delete(`/api/cart/items/${itemId}`)
    expect(res.status()).toBe(404)
    // userA's item still present
    const cart = await (await userA.context.get('/api/cart')).json()
    expect(cart.items).toHaveLength(1)
    await userA.context.dispose()
    await userB.context.dispose()
  })

  test('owner DELETE own line → 200, line gone', async () => {
    const { user, itemId } = await seedItem('del-own')
    const res = await user.context.delete(`/api/cart/items/${itemId}`)
    expect(res.status()).toBe(200)
    const cart = await (await user.context.get('/api/cart')).json()
    expect(cart.items).toHaveLength(0)
    await user.context.dispose()
  })
})

test('cart isolation between users', async () => {
  const a = await registerUser('iso-a')
  const b = await registerUser('iso-b')
  await a.context.post('/api/cart/items', { data: { productId: 1, quantity: 2 } })
  const aCart = await (await a.context.get('/api/cart')).json()
  const bCart = await (await b.context.get('/api/cart')).json()
  expect(aCart.items).toHaveLength(1)
  expect(bCart.items).toHaveLength(0)
  await a.context.dispose()
  await b.context.dispose()
})
