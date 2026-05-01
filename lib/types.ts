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
