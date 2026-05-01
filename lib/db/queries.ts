// Single SQL boundary for app routes + server components.
// Wk1-6 helpers stay sync (raw better-sqlite3 prepares).
// Wk7+8 helpers are async (Kysely via lib/db/kysely.ts).
// Backfill of Wk1-6 to Kysely is a future follow-up.

import { sql, type SqlBool } from 'kysely'
import { kdb } from './kysely.ts'
import type {
  Product,
  CartItemView,
  OrderRow,
  OrderItemSnapshot,
  OrderListItem,
} from '@/lib/types'
import type { CheckoutShippingInput } from '@/lib/schemas/checkout'

export type SortKey = 'price_asc' | 'price_desc' | 'name_asc' | 'newest'

export type ListProductsFilter = {
  category?: string
  sort?: string
  q?: string
  limit: number
  offset: number
}

export async function listProducts(filter: ListProductsFilter): Promise<Product[]> {
  const sortKey: SortKey =
    filter.sort === 'price_asc' ||
    filter.sort === 'price_desc' ||
    filter.sort === 'name_asc' ||
    filter.sort === 'newest'
      ? filter.sort
      : 'newest'

  let qb = kdb.selectFrom('products').selectAll()

  if (filter.category) qb = qb.where('category', '=', filter.category)

  if (filter.q) {
    const escaped = filter.q
      .replaceAll('\\', '\\\\')
      .replaceAll('%', '\\%')
      .replaceAll('_', '\\_')
    const pattern = `%${escaped}%`
    qb = qb.where(sql<SqlBool>`name LIKE ${pattern} ESCAPE '\\'`)
  }

  switch (sortKey) {
    case 'price_asc':
      qb = qb.orderBy('price_cents', 'asc')
      break
    case 'price_desc':
      qb = qb.orderBy('price_cents', 'desc')
      break
    case 'name_asc':
      qb = qb.orderBy(sql`name COLLATE NOCASE`, 'asc')
      break
    case 'newest':
      qb = qb.orderBy('created_at', 'desc')
      break
  }

  return qb.limit(filter.limit).offset(filter.offset).execute()
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const row = await kdb
    .selectFrom('products')
    .selectAll()
    .where('slug', '=', slug)
    .executeTakeFirst()
  return row ?? null
}

export async function listCategories(): Promise<string[]> {
  const rows = await kdb
    .selectFrom('products')
    .select('category')
    .distinct()
    .orderBy('category')
    .execute()
  return rows.map((r) => r.category)
}

export type UserRow = {
  id: number
  email: string
  password_hash: string
  name: string
  created_at: string
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const row = await kdb
    .selectFrom('users')
    .selectAll()
    .where('email', '=', email)
    .executeTakeFirst()
  return row ?? null
}

export async function insertUser(
  email: string,
  passwordHash: string,
  name: string,
): Promise<{ id: number }> {
  return kdb
    .insertInto('users')
    .values({ email, password_hash: passwordHash, name })
    .returning('id')
    .executeTakeFirstOrThrow()
}

// Cart helpers — async (Kysely). Wk6 stubs were sync placeholders;
// final shapes are Promise<T> per plan D1 (extended).

export async function getOrCreateCart(userId: number): Promise<{ id: number }> {
  const row = await kdb
    .selectFrom('carts')
    .select('id')
    .where('user_id', '=', userId)
    .executeTakeFirst()
  if (row) return row
  return kdb
    .insertInto('carts')
    .values({ user_id: userId })
    .returning('id')
    .executeTakeFirstOrThrow()
}

// Pure read. Reused inside createOrderForUser's transaction (Wk8); do not
// add side effects.
export async function listCartItems(cartId: number): Promise<CartItemView[]> {
  return kdb
    .selectFrom('cart_items as ci')
    .innerJoin('products as p', 'p.id', 'ci.product_id')
    .select([
      'ci.id as id',
      'ci.product_id as productId',
      'ci.quantity as quantity',
      'p.name as name',
      'p.price_cents as price_cents',
      'p.image_url as image_url',
      'p.stock as stock',
      'p.slug as slug',
      sql<number>`(p.price_cents * ci.quantity)`.as('line_total_cents'),
    ])
    .where('ci.cart_id', '=', cartId)
    .orderBy('ci.id')
    .execute()
}

export async function upsertCartItem(
  cartId: number,
  productId: number,
  qty: number,
): Promise<void> {
  await kdb
    .insertInto('cart_items')
    .values({ cart_id: cartId, product_id: productId, quantity: qty })
    .onConflict((oc) =>
      oc.columns(['cart_id', 'product_id']).doUpdateSet({
        quantity: (eb) => eb('cart_items.quantity', '+', eb.ref('excluded.quantity')),
      }),
    )
    .execute()
}

export async function updateCartItemQty(
  itemId: number,
  cartId: number,
  qty: number,
): Promise<number> {
  if (qty <= 0) throw new Error('invalid_quantity')
  const r = await kdb
    .updateTable('cart_items')
    .set({ quantity: qty })
    .where('id', '=', itemId)
    .where('cart_id', '=', cartId)
    .executeTakeFirst()
  return Number(r.numUpdatedRows)
}

export async function removeCartItem(itemId: number, cartId: number): Promise<number> {
  const r = await kdb
    .deleteFrom('cart_items')
    .where('id', '=', itemId)
    .where('cart_id', '=', cartId)
    .executeTakeFirst()
  return Number(r.numDeletedRows)
}

export async function getProductForCart(
  productId: number,
): Promise<Pick<Product, 'id' | 'price_cents' | 'stock'> | null> {
  const row = await kdb
    .selectFrom('products')
    .select(['id', 'price_cents', 'stock'])
    .where('id', '=', productId)
    .executeTakeFirst()
  return row ?? null
}

export async function getCartLineQuantity(
  cartId: number,
  productId: number,
): Promise<number> {
  const row = await kdb
    .selectFrom('cart_items')
    .select('quantity')
    .where('cart_id', '=', cartId)
    .where('product_id', '=', productId)
    .executeTakeFirst()
  return row?.quantity ?? 0
}

export async function getCartItemOwnership(
  itemId: number,
  cartId: number,
): Promise<number | null> {
  const row = await kdb
    .selectFrom('cart_items')
    .select('product_id')
    .where('id', '=', itemId)
    .where('cart_id', '=', cartId)
    .executeTakeFirst()
  return row?.product_id ?? null
}

// Order helpers — async (Kysely). Plan §6.

export function createOrderForUser(
  userId: number,
  shipping: CheckoutShippingInput,
): Promise<{ id: number }> {
  return kdb.transaction().execute(async (trx) => {
    // R1 — inline cart lookup; never call getOrCreateCart() (uses kdb, not trx).
    const cart = await trx
      .selectFrom('carts')
      .select('id')
      .where('user_id', '=', userId)
      .executeTakeFirst()
    if (!cart) throw new Error('cart_empty')

    const items = await trx
      .selectFrom('cart_items as ci')
      .innerJoin('products as p', 'p.id', 'ci.product_id')
      .select([
        'ci.id as id',
        'ci.product_id as productId',
        'ci.quantity as quantity',
        'p.name as name',
        'p.price_cents as price_cents',
      ])
      .where('ci.cart_id', '=', cart.id)
      .orderBy('ci.id')
      .execute()
    if (items.length === 0) throw new Error('cart_empty')

    let totalCents = 0
    for (const it of items) {
      const r = await trx
        .updateTable('products')
        .set({ stock: sql`stock - ${it.quantity}` })
        .where('id', '=', it.productId)
        .where('stock', '>=', it.quantity)
        .executeTakeFirst()
      if (Number(r.numUpdatedRows) === 0) throw new Error('insufficient_stock')
      totalCents += it.price_cents * it.quantity
    }
    if (!Number.isSafeInteger(totalCents)) throw new Error('total_overflow')

    const order = await trx
      .insertInto('orders')
      .values({
        user_id: userId,
        total_cents: totalCents,
        shipping_name: shipping.name,
        shipping_address: shipping.address,
        shipping_city: shipping.city,
        shipping_zip: shipping.zip,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await trx
      .insertInto('order_items')
      .values(
        items.map((it) => ({
          order_id: order.id,
          product_id: it.productId,
          name_snapshot: it.name,
          price_cents_snapshot: it.price_cents,
          quantity: it.quantity,
        })),
      )
      .execute()

    await trx.deleteFrom('cart_items').where('cart_id', '=', cart.id).execute()
    return order
  })
}

export async function listOrdersForUser(userId: number): Promise<OrderListItem[]> {
  const rows = await kdb
    .selectFrom('orders as o')
    .leftJoin('order_items as oi', 'oi.order_id', 'o.id')
    .select([
      'o.id as id',
      'o.total_cents as total_cents',
      'o.created_at as created_at',
      sql<number>`COALESCE(SUM(oi.quantity), 0)`.as('item_count'),
    ])
    .where('o.user_id', '=', userId)
    .groupBy('o.id')
    .orderBy('o.created_at', 'desc')
    .execute()
  return rows
}

export async function getOrderForUser(
  userId: number,
  orderId: number,
): Promise<{ order: OrderRow; items: OrderItemSnapshot[] } | null> {
  const order = await kdb
    .selectFrom('orders')
    .selectAll()
    .where('id', '=', orderId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  if (!order) return null
  const items = await kdb
    .selectFrom('order_items')
    .select(['id', 'product_id', 'name_snapshot', 'price_cents_snapshot', 'quantity'])
    .where('order_id', '=', orderId)
    .orderBy('id')
    .execute()
  return { order: order as OrderRow, items }
}
