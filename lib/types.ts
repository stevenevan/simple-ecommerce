// Casing convention:
//  - Fields mirror DB column names (snake_case): image_url, price_cents, etc.
//  - Synthetic / computed fields stay snake_case for consistency: line_total_cents.
//  - `CartItemView.productId` is a grandfathered camelCase exception from Wk 6;
//    new types MUST NOT add camelCase fields. If a column must be exposed under
//    a different name, alias it in the SELECT and keep snake_case.

import type { ClientSortKey } from './sort'

export type Product = {
  id: number
  slug: string
  name: string
  description: string
  price_cents: number
  image_url: string
  category: string
  stock: number
  created_at: string
}

export type ApiError = { error: string }

export type ProductListQuery = {
  category?: string
  sort?: ClientSortKey
  q?: string
  limit?: number
  offset?: number
}

export type CartItemView = {
  id: number
  productId: number
  slug: string
  name: string
  image_url: string
  price_cents: number
  quantity: number
  line_total_cents: number
  stock: number
}

export type OrderItemSnapshot = {
  id: number
  product_id: number
  name_snapshot: string
  price_cents_snapshot: number
  quantity: number
}

export type OrderRow = {
  id: number
  user_id: number
  total_cents: number
  shipping_name: string
  shipping_address: string
  shipping_city: string
  shipping_zip: string
  status: 'confirmed'
  created_at: string
}

export type OrderListItem = {
  id: number
  total_cents: number
  created_at: string
  item_count: number
}
