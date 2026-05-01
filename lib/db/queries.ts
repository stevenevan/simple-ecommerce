// Single SQL boundary for app routes + server components.
// Wk1-6 helpers stay sync (raw better-sqlite3 prepares).
// Wk7+8 helpers are async (Kysely via lib/db/kysely.ts).
// Backfill of Wk1-6 to Kysely is a future follow-up.

import { sql } from 'kysely'
import { getDb } from './index.ts'
import { kdb } from './kysely.ts'
import type { Product, CartItemView } from '@/lib/types'

export const SORT_COLUMNS = {
  price_asc:  'price_cents ASC',
  price_desc: 'price_cents DESC',
  name_asc:   'name COLLATE NOCASE ASC',
  newest:     'created_at DESC',
} as const

export type SortKey = keyof typeof SORT_COLUMNS

const getProductBySlugStmt = () => getDb().prepare<[string], Product>(
  'SELECT * FROM products WHERE slug = ? LIMIT 1',
)

const listCategoriesStmt = () => getDb().prepare<[], { category: string }>(
  'SELECT DISTINCT category FROM products ORDER BY category',
)

export type ListProductsFilter = {
  category?: string
  sort?: string
  q?: string
  limit: number
  offset: number
}

export function listProducts(filter: ListProductsFilter): Product[] {
  const orderBy = SORT_COLUMNS[filter.sort as SortKey] ?? SORT_COLUMNS.newest
  const where: string[] = []
  const params: unknown[] = []

  if (filter.category) {
    where.push('category = ?')
    params.push(filter.category)
  }
  if (filter.q) {
    const escaped = filter.q
      .replaceAll('\\', '\\\\')
      .replaceAll('%', '\\%')
      .replaceAll('_', '\\_')
    where.push("name LIKE ? ESCAPE '\\'")
    params.push(`%${escaped}%`)
  }

  const sql = `
    SELECT * FROM products
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `
  params.push(filter.limit, filter.offset)

  return getDb().prepare(sql).all(...params) as Product[]
}

export function getProductBySlug(slug: string): Product | null {
  return getProductBySlugStmt().get(slug) ?? null
}

export function listCategories(): string[] {
  return listCategoriesStmt().all().map((r) => r.category)
}

export type UserRow = {
  id: number
  email: string
  password_hash: string
  name: string
  created_at: string
}

const getUserByEmailStmt = () => getDb().prepare<[string], UserRow>(
  'SELECT * FROM users WHERE email = ? LIMIT 1',
)

const insertUserStmt = () => getDb().prepare<[string, string, string]>(
  'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
)

export function getUserByEmail(email: string): UserRow | null {
  return getUserByEmailStmt().get(email) ?? null
}

export function insertUser(email: string, passwordHash: string, name: string): { id: number } {
  const info = insertUserStmt().run(email, passwordHash, name)
  return { id: Number(info.lastInsertRowid) }
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
