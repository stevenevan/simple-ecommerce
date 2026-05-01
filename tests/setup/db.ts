// Vitest DB harness. Strategy:
//   - One :memory: DB per test file (vitest's default isolate:true gives each
//     file its own module cache, hence its own kdb instance).
//   - setupDb() runs migrations once per file, in beforeAll.
//   - truncateAll() clears data between tests, in beforeEach.
//
// We deliberately do NOT re-create the kdb handle between tests. The kysely
// module exports `kdb` as a const captured at first import; replacing the
// underlying globalThis.__app_db handle would leave kdb bound to a closed
// connection. Truncate-in-transaction is the e2e fixture pattern and is
// faster anyway.

import bcrypt from 'bcryptjs'
import { runMigrations } from '@/lib/db/migrate'
import { kdb } from '@/lib/db/kysely'

const BCRYPT_TEST_COST = 4

export function setupDb(): void {
  runMigrations()
}

export async function truncateAll(): Promise<void> {
  await kdb.transaction().execute(async (trx) => {
    await trx.deleteFrom('order_items').execute()
    await trx.deleteFrom('orders').execute()
    await trx.deleteFrom('cart_items').execute()
    await trx.deleteFrom('carts').execute()
    await trx.deleteFrom('users').execute()
    await trx.deleteFrom('products').execute()
  })
}

export type SeedProductInput = {
  slug?: string
  name?: string
  description?: string
  price_cents?: number
  image_url?: string
  category?: string
  stock?: number
}

let productCounter = 0

export async function seedProduct(input: SeedProductInput = {}): Promise<{
  id: number
  slug: string
  name: string
  price_cents: number
  category: string
  stock: number
  image_url: string
}> {
  productCounter += 1
  const slug = input.slug ?? `p-${productCounter}-${Date.now()}`
  const row = await kdb
    .insertInto('products')
    .values({
      slug,
      name: input.name ?? `Product ${productCounter}`,
      description: input.description ?? 'desc',
      price_cents: input.price_cents ?? 1000,
      image_url: input.image_url ?? '/seed-images/_placeholder.svg',
      category: input.category ?? 'cat-a',
      stock: input.stock ?? 5,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return row
}

export async function seedUser({
  email,
  password,
  name,
}: {
  email: string
  password: string
  name?: string
}): Promise<{ id: number; email: string; name: string; password_hash: string }> {
  const password_hash = await bcrypt.hash(password, BCRYPT_TEST_COST)
  const row = await kdb
    .insertInto('users')
    .values({ email, password_hash, name: name ?? 'Test User' })
    .returningAll()
    .executeTakeFirstOrThrow()
  return row
}

export async function seedCart(userId: number): Promise<{ id: number }> {
  const row = await kdb
    .insertInto('carts')
    .values({ user_id: userId })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row
}

export async function seedCartItem(
  cartId: number,
  productId: number,
  quantity: number,
): Promise<{ id: number }> {
  const row = await kdb
    .insertInto('cart_items')
    .values({ cart_id: cartId, product_id: productId, quantity })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row
}

export function expectNoStore(res: Response): void {
  const cc = res.headers.get('cache-control')
  if (cc !== 'no-store') {
    throw new Error(`expected Cache-Control: no-store, got ${cc ?? '<absent>'}`)
  }
}
