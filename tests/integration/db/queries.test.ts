import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createOrderForUser,
  getCartItemOwnership,
  getCartLineQuantity,
  getOrCreateCart,
  getProductBySlug,
  getProductForCart,
  listCartItems,
  listCategories,
  listProducts,
  removeCartItem,
  updateCartItemQty,
  upsertCartItem,
} from '@/lib/db/queries'
import { kdb } from '@/lib/db/kysely'
import {
  seedCartItem,
  seedProduct,
  seedUser,
  setupDb,
  truncateAll,
} from '../../setup/db'

beforeAll(() => {
  setupDb()
})

beforeEach(async () => {
  await truncateAll()
})

const SHIPPING = {
  name: 'Jane',
  address: '1 St',
  city: 'NYC',
  zip: '12345',
}

describe('listProducts', () => {
  it('respects limit/offset', async () => {
    for (let i = 0; i < 5; i++) {
      await seedProduct({ slug: `lp-${i}`, name: `LP ${i}` })
    }
    const page1 = await listProducts({ limit: 2, offset: 0 })
    const page2 = await listProducts({ limit: 2, offset: 2 })
    expect(page1).toHaveLength(2)
    expect(page2).toHaveLength(2)
    expect(page1[0].id).not.toBe(page2[0].id)
  })

  it('sorts price_asc', async () => {
    await seedProduct({ slug: 's1', price_cents: 300 })
    await seedProduct({ slug: 's2', price_cents: 100 })
    await seedProduct({ slug: 's3', price_cents: 200 })
    const r = await listProducts({ sort: 'price_asc', limit: 10, offset: 0 })
    expect(r.map((p) => p.price_cents)).toEqual([100, 200, 300])
  })

  it('sorts price_desc', async () => {
    await seedProduct({ slug: 's1', price_cents: 300 })
    await seedProduct({ slug: 's2', price_cents: 100 })
    const r = await listProducts({ sort: 'price_desc', limit: 10, offset: 0 })
    expect(r.map((p) => p.price_cents)).toEqual([300, 100])
  })

  it('sorts name_asc case-insensitive', async () => {
    await seedProduct({ slug: 's1', name: 'banana' })
    await seedProduct({ slug: 's2', name: 'Apple' })
    await seedProduct({ slug: 's3', name: 'cherry' })
    const r = await listProducts({ sort: 'name_asc', limit: 10, offset: 0 })
    expect(r.map((p) => p.name)).toEqual(['Apple', 'banana', 'cherry'])
  })

  it('invalid sort string falls back to newest (allowlist guard)', async () => {
    await seedProduct({ slug: 'old' })
    // tiny delay to differentiate created_at on sqlite
    await new Promise((r) => setTimeout(r, 10))
    await seedProduct({ slug: 'new' })
    const r = await listProducts({
      sort: "price_asc'; DROP TABLE products",
      limit: 10,
      offset: 0,
    })
    expect(r[0].slug).toBe('new')
  })

  it('category filter narrows results', async () => {
    await seedProduct({ slug: 'a', category: 'cat-a' })
    await seedProduct({ slug: 'b', category: 'cat-b' })
    await seedProduct({ slug: 'c', category: 'cat-a' })
    const r = await listProducts({ category: 'cat-a', limit: 10, offset: 0 })
    expect(r).toHaveLength(2)
    expect(r.every((p) => p.category === 'cat-a')).toBe(true)
  })

  it('q LIKE escape: literal % only matches names with literal %', async () => {
    await seedProduct({ slug: 'pct', name: '100% pure' })
    await seedProduct({ slug: 'plain', name: 'just plain' })
    const r = await listProducts({ q: '100%', limit: 10, offset: 0 })
    expect(r.map((p) => p.slug)).toEqual(['pct'])
  })

  it('q LIKE escape: literal _ only matches names with literal _', async () => {
    await seedProduct({ slug: 'a_b', name: 'a_b name' })
    await seedProduct({ slug: 'axb', name: 'axb name' })
    const r = await listProducts({ q: 'a_b', limit: 10, offset: 0 })
    expect(r.map((p) => p.slug)).toEqual(['a_b'])
  })
})

describe('getProductBySlug', () => {
  it('returns row on hit', async () => {
    await seedProduct({ slug: 'hit-me' })
    const r = await getProductBySlug('hit-me')
    expect(r?.slug).toBe('hit-me')
  })

  it('returns null on miss', async () => {
    const r = await getProductBySlug('no-such-thing')
    expect(r).toBeNull()
  })
})

describe('listCategories', () => {
  it('returns distinct ordered categories', async () => {
    await seedProduct({ slug: 'a', category: 'zebra' })
    await seedProduct({ slug: 'b', category: 'alpha' })
    await seedProduct({ slug: 'c', category: 'alpha' })
    const r = await listCategories()
    expect(r).toEqual(['alpha', 'zebra'])
  })
})

describe('upsertCartItem', () => {
  it('accumulates quantity (validates + accumulator, not overwrite)', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const p = await seedProduct({ stock: 10 })
    const cart = await getOrCreateCart(u.id)
    await upsertCartItem(cart.id, p.id, 2)
    await upsertCartItem(cart.id, p.id, 3)
    const items = await listCartItems(cart.id)
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(5)
  })
})

describe('updateCartItemQty', () => {
  it('throws invalid_quantity on qty=0', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const p = await seedProduct()
    const cart = await getOrCreateCart(u.id)
    const item = await seedCartItem(cart.id, p.id, 1)
    await expect(updateCartItemQty(item.id, cart.id, 0)).rejects.toThrow('invalid_quantity')
  })

  it('throws invalid_quantity on qty=-1', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const p = await seedProduct()
    const cart = await getOrCreateCart(u.id)
    const item = await seedCartItem(cart.id, p.id, 1)
    await expect(updateCartItemQty(item.id, cart.id, -1)).rejects.toThrow('invalid_quantity')
  })

  it('returns 0 when item belongs to another cart', async () => {
    const a = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const b = await seedUser({ email: 'b@b.co', password: 'pass1234' })
    const p = await seedProduct({ stock: 10 })
    const cartA = await getOrCreateCart(a.id)
    const cartB = await getOrCreateCart(b.id)
    const itemA = await seedCartItem(cartA.id, p.id, 1)
    const changes = await updateCartItemQty(itemA.id, cartB.id, 5)
    expect(changes).toBe(0)
  })
})

describe('removeCartItem', () => {
  it('returns 0 on cross-cart delete attempt', async () => {
    const a = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const b = await seedUser({ email: 'b@b.co', password: 'pass1234' })
    const p = await seedProduct()
    const cartA = await getOrCreateCart(a.id)
    const cartB = await getOrCreateCart(b.id)
    const itemA = await seedCartItem(cartA.id, p.id, 1)
    expect(await removeCartItem(itemA.id, cartB.id)).toBe(0)
  })
})

describe('getCartItemOwnership', () => {
  it('returns null when itemId belongs to another cart (authz primitive)', async () => {
    const a = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const b = await seedUser({ email: 'b@b.co', password: 'pass1234' })
    const p = await seedProduct()
    const cartA = await getOrCreateCart(a.id)
    const cartB = await getOrCreateCart(b.id)
    const itemA = await seedCartItem(cartA.id, p.id, 1)
    expect(await getCartItemOwnership(itemA.id, cartB.id)).toBeNull()
  })

  it('returns product_id when itemId belongs to the cart', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const p = await seedProduct()
    const cart = await getOrCreateCart(u.id)
    const item = await seedCartItem(cart.id, p.id, 1)
    expect(await getCartItemOwnership(item.id, cart.id)).toBe(p.id)
  })
})

describe('getCartLineQuantity', () => {
  it('returns 0 (not null, not throw) when product is not in cart', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const p = await seedProduct()
    const cart = await getOrCreateCart(u.id)
    expect(await getCartLineQuantity(cart.id, p.id)).toBe(0)
  })

  it('returns the quantity when product is in the cart', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const p = await seedProduct({ stock: 10 })
    const cart = await getOrCreateCart(u.id)
    await seedCartItem(cart.id, p.id, 4)
    expect(await getCartLineQuantity(cart.id, p.id)).toBe(4)
  })
})

describe('getProductForCart', () => {
  it('returns null when product missing', async () => {
    expect(await getProductForCart(99999)).toBeNull()
  })
})

describe('createOrderForUser', () => {
  it('happy path: stock decrements, snapshots persist, cart cleared, total computed', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const p1 = await seedProduct({ slug: 'p1', name: 'P1', price_cents: 1000, stock: 5 })
    const p2 = await seedProduct({ slug: 'p2', name: 'P2', price_cents: 250, stock: 5 })
    const cart = await getOrCreateCart(u.id)
    await seedCartItem(cart.id, p1.id, 2)
    await seedCartItem(cart.id, p2.id, 3)

    const order = await createOrderForUser(u.id, SHIPPING)

    // total_cents = 1000*2 + 250*3 = 2750
    const got = await kdb
      .selectFrom('orders')
      .selectAll()
      .where('id', '=', order.id)
      .executeTakeFirstOrThrow()
    expect(got.total_cents).toBe(2750)
    expect(got.user_id).toBe(u.id)

    // stock decremented
    const sp1 = await kdb.selectFrom('products').select('stock').where('id', '=', p1.id).executeTakeFirstOrThrow()
    const sp2 = await kdb.selectFrom('products').select('stock').where('id', '=', p2.id).executeTakeFirstOrThrow()
    expect(sp1.stock).toBe(3)
    expect(sp2.stock).toBe(2)

    // cart_items cleared
    const remaining = await kdb.selectFrom('cart_items').selectAll().where('cart_id', '=', cart.id).execute()
    expect(remaining).toEqual([])

    // order_items snapshots
    const items = await kdb.selectFrom('order_items').selectAll().where('order_id', '=', order.id).execute()
    expect(items).toHaveLength(2)
    expect(items.find((it) => it.product_id === p1.id)?.price_cents_snapshot).toBe(1000)
    expect(items.find((it) => it.product_id === p1.id)?.name_snapshot).toBe('P1')

    // mutate product price after the order — snapshot must NOT change
    await kdb.updateTable('products').set({ price_cents: 9999, name: 'NEW' }).where('id', '=', p1.id).execute()
    const itemsAfter = await kdb.selectFrom('order_items').selectAll().where('order_id', '=', order.id).execute()
    expect(itemsAfter.find((it) => it.product_id === p1.id)?.price_cents_snapshot).toBe(1000)
    expect(itemsAfter.find((it) => it.product_id === p1.id)?.name_snapshot).toBe('P1')
  })

  it('empty cart throws cart_empty; no order rows created', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    await getOrCreateCart(u.id) // cart exists but no items
    await expect(createOrderForUser(u.id, SHIPPING)).rejects.toThrow('cart_empty')
    const orders = await kdb.selectFrom('orders').selectAll().execute()
    expect(orders).toEqual([])
  })

  it('no cart at all throws cart_empty', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    await expect(createOrderForUser(u.id, SHIPPING)).rejects.toThrow('cart_empty')
  })

  it('insufficient stock on second item rolls back first decrement', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const p1 = await seedProduct({ slug: 'p1', stock: 5 })
    const p2 = await seedProduct({ slug: 'p2', stock: 1 })
    const cart = await getOrCreateCart(u.id)
    await seedCartItem(cart.id, p1.id, 2)
    await seedCartItem(cart.id, p2.id, 5)

    await expect(createOrderForUser(u.id, SHIPPING)).rejects.toThrow('insufficient_stock')

    // first item's decrement rolled back
    const sp1 = await kdb.selectFrom('products').select('stock').where('id', '=', p1.id).executeTakeFirstOrThrow()
    expect(sp1.stock).toBe(5)

    // no order rows
    const orders = await kdb.selectFrom('orders').selectAll().execute()
    expect(orders).toEqual([])
    const oitems = await kdb.selectFrom('order_items').selectAll().execute()
    expect(oitems).toEqual([])

    // cart_items intact
    const cItems = await kdb.selectFrom('cart_items').selectAll().where('cart_id', '=', cart.id).execute()
    expect(cItems).toHaveLength(2)
  })

  it('total overflow throws total_overflow (Number.isSafeInteger guard)', async () => {
    const u = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const p = await seedProduct({ price_cents: Number.MAX_SAFE_INTEGER, stock: 10 })
    const cart = await getOrCreateCart(u.id)
    await seedCartItem(cart.id, p.id, 2)
    await expect(createOrderForUser(u.id, SHIPPING)).rejects.toThrow('total_overflow')
  })

  it('concurrent stock race: only one of two parallel orders for the last unit succeeds', async () => {
    // NOTE: better-sqlite3 is synchronous; "parallel" here is two Promises
    // queued through Kysely's transaction queue on a single connection. The
    // test exercises the WHERE stock >= qty conditional update + queueing,
    // not OS-thread concurrency. Do not "fix" by spinning up two
    // connections — :memory: does not share DB across handles.
    const u1 = await seedUser({ email: 'a@b.co', password: 'pass1234' })
    const u2 = await seedUser({ email: 'b@b.co', password: 'pass1234' })
    const p = await seedProduct({ stock: 1 })
    const c1 = await getOrCreateCart(u1.id)
    const c2 = await getOrCreateCart(u2.id)
    await seedCartItem(c1.id, p.id, 1)
    await seedCartItem(c2.id, p.id, 1)

    const results = await Promise.allSettled([
      createOrderForUser(u1.id, SHIPPING),
      createOrderForUser(u2.id, SHIPPING),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe('insufficient_stock')
  })
})
