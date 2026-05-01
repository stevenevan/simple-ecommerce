'use client'

// Load-bearing — /orders page renders nothing without this query; errors
// MUST be visible (error panel + retry CTA), not silenced.

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { OrderListItem } from '@/lib/types'
import { useMe } from '@/lib/hooks/useMe'

export function useOrders() {
  const { data: me } = useMe()
  return useQuery({
    queryKey: ['orders'],
    queryFn: () => api.get('orders').json<{ orders: OrderListItem[] }>(),
    enabled: !!me?.user,
    staleTime: 0,
  })
}
