import { test, expect } from '@playwright/test'
import { resetDb, getProductStock, countOrders, insertCartItemDirect } from '../fixtures/db'
import { registerUser } from '../fixtures/user'
import { expectNoLeakageInBody } from '../fixtures/assertions'

const VALID_SHIPPING = {
  name: 'Buyer One',
  address: '1 Main St',
  city: 'Townsville',
  zip: '12345',
}

test.beforeEach(async () => {
  await resetDb()
})

test.describe('POST /api/orders — happy path', () => {
  test('creates order, snapshots prices, decrements stock, clears cart', async () => {
    const u = await registerUser('order-happy')
    await u.context.post('/api/cart/items', { data: { productId: 1, quantity: 2 } })

    const stockBefore = await getProductStock(1)
    const cartBefore = await (await u.context.get('/api/cart')).json()
    const selectedItemIds = cartBefore.items.map((i: { id: number }) => i.id)
    const res = await u.context.post('/api/orders', {
      data: { ...VALID_SHIPPING, selectedItemIds },
    })
    expect(res.status()).toBe(200)
    const { id } = await res.json()
    expect(typeof id).toBe('number')

    // List
    const list = await (await u.context.get('/api/orders')).json()
    expect(list.orders).toHaveLength(1)
    expect(list.orders[0]).toMatchObject({ id, total_cents: 2000, item_count: 2 })

    // Detail + snapshot
    const detail = await (await u.context.get(`/api/orders/${id}`)).json()
    expect(detail.order).toMatchObject({ shipping_zip: '12345' })
    expect(detail.items).toHaveLength(1)
    expect(detail.items[0]).toMatchObject({
      product_id: 1,
      name_snapshot: 'Test Product One',
      price_cents_snapshot: 1000,
      quantity: 2,
    })

    // INVARIANT (workshop deck — vitest snippet layer 3): total === sum(line items).
    // Replaces the implicit literal pin `total_cents: 2000` against seed prices.
    const expectedTotal = detail.items.reduce(
      (sum: number, i: { price_cents_snapshot: number; quantity: number }) =>
        sum + i.price_cents_snapshot * i.quantity,
      0,
    )
    expect(detail.order.total_cents).toBe(expectedTotal)

    // Stock decrement
    expect(await getProductStock(1)).toBe(stockBefore - 2)

    // Cart cleared
    const cart = await (await u.context.get('/api/cart')).json()
    expect(cart.items).toHaveLength(0)

    await u.context.dispose()
  })
})

test.describe('POST /api/orders — failure paths', () => {
  test('empty cart → 400 cart_empty', async () => {
    const u = await registerUser('order-empty')
    // Send a non-empty placeholder id so placeOrderSchema (.min(1)) passes;
    // the freshly-registered user has no carts row at all, so
    // createOrderForUser hits `if (!cart) throw cart_empty` before it
    // inspects selectedItemIds.
    const res = await u.context.post('/api/orders', {
      data: { ...VALID_SHIPPING, selectedItemIds: [1] },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('cart_empty')
    await u.context.dispose()
  })

  test('insufficient stock (bypass cart guard) → 409, no row written, stock unchanged', async () => {
    const u = await registerUser('order-stock')
    // Direct DB insert: cart_items qty 2 for product:2 (stock 1) — bypasses cart layer guard
    const ci = await insertCartItemDirect(u.userId, 2, 2)
    const stockBefore = await getProductStock(2)
    const orderCountBefore = await countOrders()

    const res = await u.context.post('/api/orders', {
      data: { ...VALID_SHIPPING, selectedItemIds: [ci.id] },
    })
    expect(res.status()).toBe(409)
    expect((await res.json()).error).toBe('insufficient_stock')

    expect(await getProductStock(2)).toBe(stockBefore) // unchanged — trx rolled back
    expect(await countOrders()).toBe(orderCountBefore) // no order row
    // Cart still has the item (deleteFrom cart_items only happens after success)
    const cart = await (await u.context.get('/api/cart')).json()
    expect(cart.items).toHaveLength(1)
    await u.context.dispose()
  })

  test('total_overflow on safe-integer multiplication → 500 (current behavior)', async () => {
    // Documents the gap: total_overflow is not surfaced as a named error in
    // app/api/orders/route.ts:39-48; falls through to 500 server_error.
    const u = await registerUser('order-overflow')
    // product:4 has price floor(MAX_SAFE_INTEGER/2)+1; qty 2 multiplies past MAX_SAFE_INTEGER
    // and trips Number.isSafeInteger(totalCents) at lib/db/queries.ts:270.
    const ci = await insertCartItemDirect(u.userId, 4, 2)
    const res = await u.context.post('/api/orders', {
      data: { ...VALID_SHIPPING, selectedItemIds: [ci.id] },
    })
    expect(res.status()).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('server_error')
    // Negative contract (workshop rule: describe what must never happen).
    // The 500 path's catch block could leak DB internals — guard the envelope.
    expectNoLeakageInBody(body, expect)
    await u.context.dispose()
  })

  test.describe('shipping schema rejects (representatives)', () => {
    for (const [label, payload] of Object.entries({
      'missing name': { ...VALID_SHIPPING, name: '' },
      'zip non-numeric': { ...VALID_SHIPPING, zip: 'abcde' },
    })) {
      test(label, async () => {
        const u = await registerUser(`ship-${label.replace(/\s+/g, '-')}`)
        const res = await u.context.post('/api/orders', { data: payload })
        expect(res.status()).toBe(400)
        const body = await res.json()
        expect(body.error).toBe('invalid_form')
        expect(body.fields).toBeTruthy()
        await u.context.dispose()
      })
    }
  })

  test('IDOR — userB GET userA order → 404', async () => {
    const a = await registerUser('order-idor-a')
    await a.context.post('/api/cart/items', { data: { productId: 1, quantity: 1 } })
    const cartA = await (await a.context.get('/api/cart')).json()
    const created = await a.context.post('/api/orders', {
      data: {
        ...VALID_SHIPPING,
        selectedItemIds: cartA.items.map((i: { id: number }) => i.id),
      },
    })
    expect(created.status()).toBe(200) // precondition: A's order really exists
    const { id } = await created.json()
    expect(typeof id).toBe('number')

    const b = await registerUser('order-idor-b')
    const res = await b.context.get(`/api/orders/${id}`)
    expect(res.status()).toBe(404)
    await a.context.dispose()
    await b.context.dispose()
  })

  test('list scoped to user — userB sees no userA orders', async () => {
    const a = await registerUser('order-list-a')
    await a.context.post('/api/cart/items', { data: { productId: 1, quantity: 1 } })
    const cartA = await (await a.context.get('/api/cart')).json()
    const placed = await a.context.post('/api/orders', {
      data: {
        ...VALID_SHIPPING,
        selectedItemIds: cartA.items.map((i: { id: number }) => i.id),
      },
    })
    expect(placed.status()).toBe(200) // precondition: A's order really exists
    const { id: aOrderId } = await placed.json()

    const b = await registerUser('order-list-b')
    const list = await (await b.context.get('/api/orders')).json()
    expect(list.orders).toHaveLength(0)
    expect(
      list.orders.find((o: { id: number }) => o.id === aOrderId),
    ).toBeUndefined()
    await a.context.dispose()
    await b.context.dispose()
  })

  test('bad id format /api/orders/abc → 404 (representative)', async () => {
    const u = await registerUser('order-badid')
    const res = await u.context.get('/api/orders/abc')
    expect(res.status()).toBe(404)
    await u.context.dispose()
  })
})
