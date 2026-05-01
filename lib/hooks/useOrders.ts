'use client'

// Load-bearing — /orders page renders nothing without this query; errors
// MUST be visible (error panel + retry CTA), not silenced.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import type { OrderListItem } from '@/lib/types'
import type { CheckoutShippingInput } from '@/lib/schemas/checkout'
import { friendlyOf } from './_friendlyErrors'
import { useMe } from './useMe'

async function parseOrderError(e: unknown): Promise<Error> {
  if (e instanceof HTTPError) {
    const body = await e.response.json<{ error?: string }>().catch(() => null)
    return new Error(body?.error ?? `HTTP ${e.response.status}`)
  }
  return e instanceof Error ? e : new Error('Network error')
}

export function useOrders() {
  const { data: me } = useMe()
  return useQuery({
    queryKey: ['orders'],
    queryFn: () => api.get('orders').json<{ orders: OrderListItem[] }>(),
    enabled: !!me?.user,
    staleTime: 0,
  })
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CheckoutShippingInput) => {
      try {
        return await api.post('orders', { json: input }).json<{ id: number }>()
      } catch (e) {
        throw await parseOrderError(e)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['cart'] })
      toast.success('Order placed')
    },
    onError: (err) => toast.error(friendlyOf(err.message)),
  })
}
