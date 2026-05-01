// Single read-side SQL boundary for app routes + server components.
// Wk7/8 will add transaction-wrapped composites here (e.g. placeOrder).
// Do NOT add a generic runInTransaction helper until a real use case lands.

import { getDb } from './index.ts'
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

// Cart helpers — Wk7 fills SQL. Signatures locked here so route handlers
// + types compile against the final shape now.
export function getOrCreateCart(_userId: number): { id: number } {
  throw new Error('Week 7')
}

export function listCartItems(_cartId: number): CartItemView[] {
  throw new Error('Week 7')
}

export function upsertCartItem(_cartId: number, _productId: number, _qty: number): void {
  throw new Error('Week 7')
}

export function updateCartItemQty(_itemId: number, _cartId: number, _qty: number): void {
  throw new Error('Week 7')
}

export function removeCartItem(_itemId: number, _cartId: number): void {
  throw new Error('Week 7')
}
