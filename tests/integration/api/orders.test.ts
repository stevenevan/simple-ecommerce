import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as ordersGET, POST as ordersPOST } from '@/app/api/orders/route'
import { GET as orderGET } from '@/app/api/orders/[id]/route'
import { kdb } from '@/lib/db/kysely'
import {
  seedCart,
  seedCartItem,
  seedProduct,
  seedUser,
  setupDb,
  truncateAll,
} from '../../setup/db'
import { clearSession, setSession } from '../../setup/session'
import { makeJsonRequest } from '../../setup/request'

beforeAll(() => {
  setupDb()
})

beforeEach(async () => {
  await truncateAll()
  clearSession()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const SHIPPING = { name: 'Jane', address: '1 St', city: 'NYC', zip: '12345' }
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

async function authedWithCart() {
  const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
  setSession({ id: u.id, email: u.email, name: u.name })
  return u
}

describe('POST /api/orders', () => {
  it('401 unauthenticated', async () => {
    const res = await ordersPOST(makeJsonRequest('/api/orders', { method: 'POST', body: SHIPPING }))
    expect(res.status).toBe(401)
  })

  it('413 oversize', async () => {
    await authedWithCart()
    const res = await ordersPOST(makeJsonRequest('/api/orders', {
      method: 'POST',
      body: '{}',
      contentLengthOverride: '20000',
    }))
    expect(res.status).toBe(413)
  })

  it('400 invalid_form on bad shipping (missing zip)', async () => {
    await authedWithCart()
    const res = await ordersPOST(makeJsonRequest('/api/orders', {
      method: 'POST',
      body: { ...SHIPPING, zip: '' },
    }))
    expect(res.status).toBe(400)
  })

  it('400 invalid_form on bad zip regex', async () => {
    await authedWithCart()
    const res = await ordersPOST(makeJsonRequest('/api/orders', {
      method: 'POST',
      body: { ...SHIPPING, zip: 'abcde' },
    }))
    expect(res.status).toBe(400)
  })

  it('400 invalid_form when no cart at all (empty selectedItemIds)', async () => {
    await authedWithCart()
    const res = await ordersPOST(makeJsonRequest('/api/orders', {
      method: 'POST',
      body: { ...SHIPPING, selectedItemIds: [] },
    }))
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('invalid_form')
  })

  it('400 invalid_form when cart exists but has no items (empty selectedItemIds)', async () => {
    const u = await authedWithCart()
    await seedCart(u.id)
    const res = await ordersPOST(makeJsonRequest('/api/orders', {
      method: 'POST',
      body: { ...SHIPPING, selectedItemIds: [] },
    }))
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('invalid_form')
  })

  it('409 insufficient_stock mapping', async () => {
    const u = await authedWithCart()
    const p = await seedProduct({ stock: 1 })
    const cart = await seedCart(u.id)
    const ci = await seedCartItem(cart.id, p.id, 5)
    const res = await ordersPOST(makeJsonRequest('/api/orders', {
      method: 'POST',
      body: { ...SHIPPING, selectedItemIds: [ci.id] },
    }))
    expect(res.status).toBe(409)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('insufficient_stock')
  })

  it('500 server_error on total_overflow (route does not map this branch)', async () => {
    const u = await authedWithCart()
    const p = await seedProduct({ price_cents: Number.MAX_SAFE_INTEGER, stock: 10 })
    const cart = await seedCart(u.id)
    const ci = await seedCartItem(cart.id, p.id, 2)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await ordersPOST(makeJsonRequest('/api/orders', {
      method: 'POST',
      body: { ...SHIPPING, selectedItemIds: [ci.id] },
    }))
    expect(res.status).toBe(500)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('server_error')
    errSpy.mockRestore()
  })

  it('happy path: order created, stock decremented, cart cleared, no-store', async () => {
    const u = await authedWithCart()
    const p = await seedProduct({ price_cents: 1000, stock: 5 })
    const cart = await seedCart(u.id)
    const ci = await seedCartItem(cart.id, p.id, 2)

    const res = await ordersPOST(makeJsonRequest('/api/orders', {
      method: 'POST',
      body: { ...SHIPPING, selectedItemIds: [ci.id] },
    }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const json = (await res.json()) as { id: number }
    expect(json.id).toBeGreaterThan(0)

    const stock = await kdb.selectFrom('products').select('stock').where('id', '=', p.id).executeTakeFirstOrThrow()
    expect(stock.stock).toBe(3)
    const remaining = await kdb.selectFrom('cart_items').selectAll().where('cart_id', '=', cart.id).execute()
    expect(remaining).toEqual([])
  })

  it('mass assignment: total_cents/status/user_id from body are ignored', async () => {
    const u = await authedWithCart()
    const p = await seedProduct({ price_cents: 1000, stock: 5 })
    const cart = await seedCart(u.id)
    const ci = await seedCartItem(cart.id, p.id, 2)
    const res = await ordersPOST(makeJsonRequest('/api/orders', {
      method: 'POST',
      body: {
        ...SHIPPING,
        selectedItemIds: [ci.id],
        total_cents: 0,
        status: 'shipped',
        user_id: 9999,
      },
    }))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { id: number }
    const got = await kdb.selectFrom('orders').selectAll().where('id', '=', json.id).executeTakeFirstOrThrow()
    expect(got.total_cents).toBe(2000) // computed from cart, not from body
    expect(got.status).toBe('confirmed') // schema default
    expect(got.user_id).toBe(u.id) // session user, not body user_id
  })
})

describe('GET /api/orders', () => {
  it('401 unauthenticated', async () => {
    const res = await ordersGET()
    expect(res.status).toBe(401)
  })

  it('returns user A\'s orders only — not user B\'s', async () => {
    const a = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const b = await seedUser({ email: 'b@b.co', password: 'pass1234' })
    await kdb
      .insertInto('orders')
      .values([
        { user_id: a.id, total_cents: 100, shipping_name: 'A', shipping_address: '1', shipping_city: 'X', shipping_zip: '12345' },
        { user_id: b.id, total_cents: 200, shipping_name: 'B', shipping_address: '2', shipping_city: 'Y', shipping_zip: '67890' },
      ])
      .execute()

    setSession({ id: a.id, email: a.email, name: a.name })
    const res = await ordersGET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const json = (await res.json()) as { orders: Array<{ total_cents: number }> }
    expect(json.orders).toHaveLength(1)
    expect(json.orders[0].total_cents).toBe(100)
  })
})

describe('GET /api/orders/[id]', () => {
  it('401 unauthenticated', async () => {
    const res = await orderGET(new Request('http://test.local'), ctx('1'))
    expect(res.status).toBe(401)
  })

  it.each(['abc', '0', '-1', '1; DROP TABLE orders', String(Number.MAX_SAFE_INTEGER + 1)])(
    'ID boundary "%s" → 404',
    async (id) => {
      const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
      setSession({ id: u.id, email: u.email, name: u.name })
      const res = await orderGET(new Request('http://test.local'), ctx(id))
      expect(res.status).toBe(404)
    },
  )

  it('404 cross-user: A cannot read B\'s order', async () => {
    const a = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const b = await seedUser({ email: 'b@b.co', password: 'pass1234' })
    const order = await kdb
      .insertInto('orders')
      .values({
        user_id: b.id,
        total_cents: 100,
        shipping_name: 'B',
        shipping_address: '1',
        shipping_city: 'X',
        shipping_zip: '12345',
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    setSession({ id: a.id, email: a.email, name: a.name })
    const res = await orderGET(new Request('http://test.local'), ctx(String(order.id)))
    expect(res.status).toBe(404)
  })

  it('200 returns { order, items } for owner', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const p = await seedProduct({ slug: 'snap-p' })
    const order = await kdb
      .insertInto('orders')
      .values({
        user_id: u.id,
        total_cents: 100,
        shipping_name: 'U',
        shipping_address: '1',
        shipping_city: 'X',
        shipping_zip: '12345',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await kdb
      .insertInto('order_items')
      .values({
        order_id: order.id,
        product_id: p.id,
        name_snapshot: 'Snap',
        price_cents_snapshot: 50,
        quantity: 2,
      })
      .execute()

    setSession({ id: u.id, email: u.email, name: u.name })
    const res = await orderGET(new Request('http://test.local'), ctx(String(order.id)))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const json = (await res.json()) as { order: { id: number }; items: Array<{ name_snapshot: string }> }
    expect(json.order.id).toBe(order.id)
    expect(json.items).toHaveLength(1)
    expect(json.items[0].name_snapshot).toBe('Snap')
  })
})
