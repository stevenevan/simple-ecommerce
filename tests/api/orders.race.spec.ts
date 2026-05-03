// Concurrency: two users race to order the last unit of product:2 (stock 1).
//
// Stock serialization relies on the `WHERE stock >= quantity` guard in
// lib/db/queries.ts:265. If that guard is removed, this test stops catching
// the race even though both transactions interleave — they will both see
// stock=1 on read, but only one UPDATE will match the WHERE clause and
// succeed; the other returns numUpdatedRows=0 → throws insufficient_stock.

import { test, expect } from '@playwright/test'
import { resetDb, getProductStock, countOrders } from '../fixtures/db'
import { registerUser } from '../fixtures/user'

const VALID_SHIPPING = {
  name: 'Racer',
  address: '1 Race Way',
  city: 'Speedburg',
  zip: '12345',
}

const ITERATIONS = 5

test.describe('order race — single-unit stock', () => {
  test(`${ITERATIONS}x: exactly one 200 + one 409, stock=0, exactly one order row`, async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      await resetDb()

      const a = await registerUser(`race-${i}-a`)
      const b = await registerUser(`race-${i}-b`)
      // Both add product:2 (stock 1) to their separate carts.
      await a.context.post('/api/cart/items', { data: { productId: 2, quantity: 1 } })
      await b.context.post('/api/cart/items', { data: { productId: 2, quantity: 1 } })

      // Schema requires selectedItemIds — fetch each user's cart once before
      // the race so the concurrent POSTs hit the contended UPDATE.
      const [cartA, cartB] = await Promise.all([
        a.context.get('/api/cart').then((r) => r.json()),
        b.context.get('/api/cart').then((r) => r.json()),
      ])
      const idsA = cartA.items.map((i: { id: number }) => i.id)
      const idsB = cartB.items.map((i: { id: number }) => i.id)

      const settled = await Promise.allSettled([
        a.context.post('/api/orders', {
          data: { ...VALID_SHIPPING, selectedItemIds: idsA },
        }),
        b.context.post('/api/orders', {
          data: { ...VALID_SHIPPING, selectedItemIds: idsB },
        }),
      ])

      // Both promises must have resolved (not rejected/hung).
      expect(settled.every((s) => s.status === 'fulfilled'), `iter ${i}: both fulfilled`).toBe(true)
      const statuses = await Promise.all(
        settled.map(async (s) => (s.status === 'fulfilled' ? s.value.status() : -1)),
      )
      const sorted = [...statuses].sort()
      expect(sorted, `iter ${i} statuses: ${JSON.stringify(statuses)}`).toEqual([200, 409])

      expect(await getProductStock(2), `iter ${i} stock`).toBe(0)
      expect(await countOrders(), `iter ${i} order count`).toBe(1)

      await a.context.dispose()
      await b.context.dispose()
    }
  })
})
