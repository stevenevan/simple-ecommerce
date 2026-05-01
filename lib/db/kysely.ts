import { Kysely, SqliteDialect, type Generated } from 'kysely'
import { getDb } from './index.ts'

interface UsersTable {
  id: Generated<number>
  email: string
  password_hash: string
  name: string
  created_at: Generated<string>
}
interface ProductsTable {
  id: Generated<number>
  slug: string
  name: string
  description: string
  price_cents: number
  image_url: string
  category: string
  stock: number
  created_at: Generated<string>
}
interface CartsTable {
  id: Generated<number>
  user_id: number
  updated_at: Generated<string>
}
interface CartItemsTable {
  id: Generated<number>
  cart_id: number
  product_id: number
  quantity: number
}
interface OrdersTable {
  id: Generated<number>
  user_id: number
  total_cents: number
  shipping_name: string
  shipping_address: string
  shipping_city: string
  shipping_zip: string
  status: Generated<'confirmed'>
  created_at: Generated<string>
}
interface OrderItemsTable {
  id: Generated<number>
  order_id: number
  product_id: number
  name_snapshot: string
  price_cents_snapshot: number
  quantity: number
}

export interface Database {
  users: UsersTable
  products: ProductsTable
  carts: CartsTable
  cart_items: CartItemsTable
  orders: OrdersTable
  order_items: OrderItemsTable
}

declare global {
  var __app_kdb: Kysely<Database> | undefined
}

export const kdb: Kysely<Database> =
  globalThis.__app_kdb ??
  (globalThis.__app_kdb = new Kysely<Database>({
    dialect: new SqliteDialect({ database: getDb() }),
  }))
