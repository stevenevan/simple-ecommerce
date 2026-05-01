import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as cartGET } from '@/app/api/cart/route'
import { POST as itemsPOST } from '@/app/api/cart/items/route'
import {
  PATCH as itemPATCH,
  DELETE as itemDELETE,
} from '@/app/api/cart/items/[id]/route'
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
import type { NextRequest } from 'next/server'

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

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/cart', () => {
  it('401 unauthenticated', async () => {
    const res = await cartGET()
    expect(res.status).toBe(401)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('200 empty for new user, no-store', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    setSession({ id: u.id, email: u.email, name: u.name })
    const res = await cartGET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const json = (await res.json()) as { items: unknown[]; subtotalCents: number }
    expect(json.items).toEqual([])
    expect(json.subtotalCents).toBe(0)
  })

  it('subtotalCents = sum of line_total_cents', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const p1 = await seedProduct({ price_cents: 1000, stock: 5 })
    const p2 = await seedProduct({ price_cents: 250, stock: 5 })
    const cart = await seedCart(u.id)
    await seedCartItem(cart.id, p1.id, 2) // 2000
    await seedCartItem(cart.id, p2.id, 3) // 750
    setSession({ id: u.id, email: u.email, name: u.name })
    const res = await cartGET()
    const json = (await res.json()) as { subtotalCents: number; items: unknown[] }
    expect(json.subtotalCents).toBe(2750)
    expect(json.items).toHaveLength(2)
  })

  it('cross-user isolation: user A only sees A\'s items', async () => {
    const a = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const b = await seedUser({ email: 'b@b.co', password: 'pass1234' })
    const p = await seedProduct({ stock: 10 })
    const cartA = await seedCart(a.id)
    const cartB = await seedCart(b.id)
    await seedCartItem(cartA.id, p.id, 1)
    await seedCartItem(cartB.id, p.id, 9)

    setSession({ id: a.id, email: a.email, name: a.name })
    const res = await cartGET()
    const json = (await res.json()) as { items: Array<{ quantity: number }> }
    expect(json.items).toHaveLength(1)
    expect(json.items[0].quantity).toBe(1)
  })
})

describe('POST /api/cart/items', () => {
  async function authed() {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    setSession({ id: u.id, email: u.email, name: u.name })
    return u
  }

  it('401 unauthenticated', async () => {
    const res = await itemsPOST(makeJsonRequest('/api/cart/items', { method: 'POST', body: { productId: 1, quantity: 1 } }))
    expect(res.status).toBe(401)
  })

  it('413 oversize', async () => {
    await authed()
    const res = await itemsPOST(makeJsonRequest('/api/cart/items', {
      method: 'POST',
      body: '{}',
      contentLengthOverride: '20000',
    }))
    expect(res.status).toBe(413)
  })

  it.each([
    { label: 'non-int productId', body: { productId: 'x', quantity: 1 } },
    { label: 'non-int quantity', body: { productId: 1, quantity: 'x' } },
    { label: 'qty=0', body: { productId: 1, quantity: 0 } },
    { label: 'qty=-1', body: { productId: 1, quantity: -1 } },
    { label: 'qty over MAX_QUANTITY', body: { productId: 1, quantity: 1000 } },
  ])('400 invalid_form on $label', async ({ body }) => {
    await authed()
    const res = await itemsPOST(makeJsonRequest('/api/cart/items', { method: 'POST', body }))
    expect(res.status).toBe(400)
  })

  it('400 on prototype-pollution payload; Object.prototype unchanged', async () => {
    await authed()
    const before = (Object.prototype as unknown as { polluted?: number }).polluted
    const res = await itemsPOST(makeJsonRequest('/api/cart/items', {
      method: 'POST',
      body: '{"__proto__":{"polluted":1},"productId":1,"quantity":1}',
    }))
    expect([400, 404, 409]).toContain(res.status) // depends on parser; main check is no pollution
    expect((Object.prototype as unknown as { polluted?: number }).polluted).toBe(before)
  })

  it('404 on unknown productId', async () => {
    await authed()
    const res = await itemsPOST(makeJsonRequest('/api/cart/items', {
      method: 'POST',
      body: { productId: 999999, quantity: 1 },
    }))
    expect(res.status).toBe(404)
  })

  it('409 insufficient_stock when existingQty + quantity > stock', async () => {
    const u = await authed()
    const p = await seedProduct({ stock: 3 })
    const cart = await seedCart(u.id)
    await seedCartItem(cart.id, p.id, 2)
    const res = await itemsPOST(makeJsonRequest('/api/cart/items', {
      method: 'POST',
      body: { productId: p.id, quantity: 2 },
    }))
    expect(res.status).toBe(409)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('insufficient_stock')
  })

  it('happy path: row inserted; second call increments (upsert)', async () => {
    const u = await authed()
    const p = await seedProduct({ stock: 10 })
    const r1 = await itemsPOST(makeJsonRequest('/api/cart/items', {
      method: 'POST',
      body: { productId: p.id, quantity: 2 },
    }))
    expect(r1.status).toBe(200)
    expect(r1.headers.get('cache-control')).toBe('no-store')
    const r2 = await itemsPOST(makeJsonRequest('/api/cart/items', {
      method: 'POST',
      body: { productId: p.id, quantity: 3 },
    }))
    expect(r2.status).toBe(200)

    const items = await kdb
      .selectFrom('cart_items as ci')
      .innerJoin('carts as c', 'c.id', 'ci.cart_id')
      .selectAll('ci')
      .where('c.user_id', '=', u.id)
      .execute()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(5)
  })

  it('mass assignment: extra fields ignored, only schema-validated cols set', async () => {
    const u = await authed()
    const p = await seedProduct({ stock: 10, price_cents: 500 })
    const res = await itemsPOST(makeJsonRequest('/api/cart/items', {
      method: 'POST',
      body: {
        productId: p.id,
        quantity: 1,
        price_cents: 0,
        cart_id: 9999,
        isAdmin: true,
      },
    }))
    expect(res.status).toBe(200)

    // verify the row was attached to user's cart, not cart_id 9999
    const items = await kdb
      .selectFrom('cart_items as ci')
      .innerJoin('carts as c', 'c.id', 'ci.cart_id')
      .select(['ci.cart_id', 'c.user_id', 'ci.quantity'])
      .where('c.user_id', '=', u.id)
      .execute()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(1)

    // product price unchanged
    const pp = await kdb.selectFrom('products').select('price_cents').where('id', '=', p.id).executeTakeFirstOrThrow()
    expect(pp.price_cents).toBe(500)
  })
})

describe('PATCH /api/cart/items/[id]', () => {
  async function authed() {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    setSession({ id: u.id, email: u.email, name: u.name })
    return u
  }

  it('401 unauthenticated', async () => {
    const res = await itemPATCH(
      makeJsonRequest('/api/cart/items/1', { method: 'PATCH', body: { quantity: 1 } }),
      ctx('1'),
    )
    expect(res.status).toBe(401)
  })

  it('413 oversize', async () => {
    await authed()
    const res = await itemPATCH(
      makeJsonRequest('/api/cart/items/1', { method: 'PATCH', body: '{}', contentLengthOverride: '20000' }),
      ctx('1'),
    )
    expect(res.status).toBe(413)
  })

  it.each(['abc', '1.5', ''])('404 on non-numeric id "%s"', async (id) => {
    await authed()
    const res = await itemPATCH(
      makeJsonRequest(`/api/cart/items/${id}`, { method: 'PATCH', body: { quantity: 1 } }),
      ctx(id),
    )
    expect(res.status).toBe(404)
  })

  it.each(['0', '-1', '1; DROP TABLE products', String(Number.MAX_SAFE_INTEGER + 1)])(
    'ID boundary "%s" → 404, no DB exception leaked',
    async (id) => {
      await authed()
      const res = await itemPATCH(
        makeJsonRequest(`/api/cart/items/${id}`, { method: 'PATCH', body: { quantity: 1 } }),
        ctx(id),
      )
      expect(res.status).toBe(404)
    },
  )

  it.each([0, -1, 1.5, 1000])('400 on bad qty %s', async (q) => {
    await authed()
    const res = await itemPATCH(
      makeJsonRequest('/api/cart/items/1', { method: 'PATCH', body: { quantity: q } }),
      ctx('1'),
    )
    expect(res.status).toBe(400)
  })

  it('404 cross-user: A cannot mutate B\'s cart_item', async () => {
    const a = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const b = await seedUser({ email: 'b@b.co', password: 'pass1234' })
    const p = await seedProduct({ stock: 10 })
    const cartB = await seedCart(b.id)
    const itemB = await seedCartItem(cartB.id, p.id, 1)
    setSession({ id: a.id, email: a.email, name: a.name })

    const res = await itemPATCH(
      makeJsonRequest(`/api/cart/items/${itemB.id}`, { method: 'PATCH', body: { quantity: 5 } }),
      ctx(String(itemB.id)),
    )
    expect(res.status).toBe(404)

    // B's item unchanged
    const got = await kdb.selectFrom('cart_items').select('quantity').where('id', '=', itemB.id).executeTakeFirstOrThrow()
    expect(got.quantity).toBe(1)
  })

  it('409 when qty exceeds stock', async () => {
    const u = await authed()
    const p = await seedProduct({ stock: 2 })
    const cart = await seedCart(u.id)
    const item = await seedCartItem(cart.id, p.id, 1)
    const res = await itemPATCH(
      makeJsonRequest(`/api/cart/items/${item.id}`, { method: 'PATCH', body: { quantity: 5 } }),
      ctx(String(item.id)),
    )
    expect(res.status).toBe(409)
  })

  it('200 success — quantity updated', async () => {
    const u = await authed()
    const p = await seedProduct({ stock: 10 })
    const cart = await seedCart(u.id)
    const item = await seedCartItem(cart.id, p.id, 1)
    const res = await itemPATCH(
      makeJsonRequest(`/api/cart/items/${item.id}`, { method: 'PATCH', body: { quantity: 4 } }),
      ctx(String(item.id)),
    )
    expect(res.status).toBe(200)
    const got = await kdb.selectFrom('cart_items').select('quantity').where('id', '=', item.id).executeTakeFirstOrThrow()
    expect(got.quantity).toBe(4)
  })
})

describe('DELETE /api/cart/items/[id]', () => {
  async function authed() {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    setSession({ id: u.id, email: u.email, name: u.name })
    return u
  }

  it('401 unauthenticated', async () => {
    const res = await itemDELETE({} as NextRequest, ctx('1'))
    expect(res.status).toBe(401)
  })

  it.each(['abc', '0', '-1', '1; DROP TABLE products'])(
    'ID boundary "%s" → 404',
    async (id) => {
      await authed()
      const res = await itemDELETE({} as NextRequest, ctx(id))
      expect(res.status).toBe(404)
    },
  )

  it('404 cross-user', async () => {
    const a = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const b = await seedUser({ email: 'b@b.co', password: 'pass1234' })
    const p = await seedProduct({ stock: 10 })
    const cartB = await seedCart(b.id)
    const itemB = await seedCartItem(cartB.id, p.id, 1)
    setSession({ id: a.id, email: a.email, name: a.name })

    const res = await itemDELETE({} as NextRequest, ctx(String(itemB.id)))
    expect(res.status).toBe(404)

    const stillThere = await kdb.selectFrom('cart_items').selectAll().where('id', '=', itemB.id).execute()
    expect(stillThere).toHaveLength(1)
  })

  it('200 success', async () => {
    const u = await authed()
    const p = await seedProduct({ stock: 10 })
    const cart = await seedCart(u.id)
    const item = await seedCartItem(cart.id, p.id, 1)
    const res = await itemDELETE({} as NextRequest, ctx(String(item.id)))
    expect(res.status).toBe(200)
    const gone = await kdb.selectFrom('cart_items').selectAll().where('id', '=', item.id).execute()
    expect(gone).toEqual([])
  })
})
