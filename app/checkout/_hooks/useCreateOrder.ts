'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import type { CheckoutShippingInput } from '@/lib/schemas/checkout'
import { friendlyOf } from '@/lib/hooks/_friendlyErrors'

// Mirrors the same helper in app/orders/_hooks/useOrders.ts (none — orders is read-only)
// and app/_hooks/useCartDrawerMutations.ts; keep in sync.
async function parseOrderError(e: unknown): Promise<Error> {
  if (e instanceof HTTPError) {
    const body = await e.response.json<{ error?: string }>().catch(() => null)
    return new Error(body?.error ?? `HTTP ${e.response.status}`)
  }
  return e instanceof Error ? e : new Error('Network error')
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
      // Server decremented stock for each ordered item — refetch the catalog so the grid reflects new stock.
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success('Order placed')
    },
    onError: (err) => toast.error(friendlyOf(err.message)),
  })
}
