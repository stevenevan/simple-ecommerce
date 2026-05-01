'use client'

// Load-bearing — does NOT toast itself; consumers decide visualization.
// CartDrawer hides the badge when data is missing (treats absence as zero).
// Checkout page renders cart.isError as a distinct branch with a Retry CTA.
// Mutation hooks (useCartMutations) carry their own toasts.

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { CartItemView } from '@/lib/types'
import { useMe } from './useMe'

export type CartResponse = { items: CartItemView[]; subtotalCents: number }

export const CART_KEY = ['cart'] as const

export function useCart() {
  const { data: me } = useMe()
  return useQuery({
    queryKey: CART_KEY,
    queryFn: () => api.get('cart').json<CartResponse>(),
    enabled: !!me?.user,
    staleTime: 0,
  })
}
