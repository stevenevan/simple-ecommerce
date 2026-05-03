// Per-test DB reset + raw helpers used to bypass route-layer guards.
// Truncate runs in one Kysely transaction so the dev server never observes
// a half-emptied DB. File-delete reset happens once in globalSetup before
// the server boots.

import { kdb } from '@/lib/db/kysely'
import { getOrCreateCart } from '@/lib/db/queries'
import { PRODUCT_STOCK } from './seed'

export async function resetDb(): Promise<void> {
  await kdb.transaction().execute(async (trx) => {
    await trx.deleteFrom('order_items').execute()
    await trx.deleteFrom('orders').execute()
    await trx.deleteFrom('cart_items').execute()
    await trx.deleteFrom('carts').execute()
    await trx.deleteFrom('users').execute()
    for (const [id, stock] of Object.entries(PRODUCT_STOCK)) {
      await trx
        .updateTable('products')
        .set({ stock })
        .where('id', '=', Number(id))
        .execute()
    }
  })
}

export async function insertCartItemDirect(
  userId: number,
  productId: number,
  quantity: number,
): Promise<{ id: number }> {
  const cart = await getOrCreateCart(userId)
  return kdb
    .insertInto('cart_items')
    .values({ cart_id: cart.id, product_id: productId, quantity })
    .returning('id')
    .executeTakeFirstOrThrow()
}

export async function getProductStock(id: number): Promise<number> {
  const row = await kdb
    .selectFrom('products')
    .select('stock')
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
  return row.stock
}

export async function countOrders(): Promise<number> {
  const row = await kdb
    .selectFrom('orders')
    .select((eb) => eb.fn.countAll<number>().as('c'))
    .executeTakeFirstOrThrow()
  return Number(row.c)
}

export async function getUserIdByEmail(email: string): Promise<number> {
  const row = await kdb
    .selectFrom('users')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirstOrThrow()
  return row.id
}

export async function getLatestOrderForUser(userId: number): Promise<{
  total_cents: number
}> {
  return kdb
    .selectFrom('orders')
    .select(['total_cents'])
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirstOrThrow()
}
