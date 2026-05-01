'use client'

import { useQuery } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { api } from '@/lib/api-client'
import type { Product, ProductListQuery, ApiError } from '@/lib/types'

function buildSearchParams(q: ProductListQuery): URLSearchParams {
  const sp = new URLSearchParams()
  if (q.category) sp.set('category', q.category)
  if (q.sort) sp.set('sort', q.sort)
  if (q.q) sp.set('q', q.q)
  if (q.limit !== undefined) sp.set('limit', String(q.limit))
  if (q.offset !== undefined) sp.set('offset', String(q.offset))
  return sp
}

function normalizeKey(q: ProductListQuery): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  if (q.category) out.category = q.category
  if (q.sort) out.sort = q.sort
  if (q.q) out.q = q.q
  if (q.limit !== undefined) out.limit = q.limit
  if (q.offset !== undefined) out.offset = q.offset
  return out
}

export function useProducts(params: ProductListQuery) {
  return useQuery({
    queryKey: ['products', normalizeKey(params)] as const,
    queryFn: async () => {
      try {
        return await api.get('products', { searchParams: buildSearchParams(params) }).json<Product[]>()
      } catch (e) {
        if (e instanceof HTTPError) {
          const body = await e.response.json<ApiError>().catch(() => ({ error: e.message }))
          const message = process.env.NODE_ENV === 'production'
            ? (e.response.status >= 500 ? 'Could not load products' : 'Bad request')
            : (body.error || `HTTP ${e.response.status}`)
          const err = new Error(message)
          ;(err as Error & { status?: number }).status = e.response.status
          throw err
        }
        throw e
      }
    },
  })
}
