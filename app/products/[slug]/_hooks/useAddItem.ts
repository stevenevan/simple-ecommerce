'use client'

// Sibling cart mutations: app/_hooks/useCartDrawerMutations.ts
// Load-bearing — toasts on success/error.
//
// Not optimistic: cart_item.id is server-issued. Fabricating a temp id is
// brittle (de-dup, rollback, concurrent adds). Round-trip is acceptable here.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { CART_KEY } from '@/lib/hooks/useCart'
import { friendlyOf } from '@/lib/hooks/_friendlyErrors'

// Mirrors parseCartError in app/_hooks/useCartDrawerMutations.ts; keep in sync.
async function parseCartError(e: unknown): Promise<Error> {
  if (e instanceof HTTPError) {
    const body = await e.response.json<{ error?: string }>().catch(() => null)
    return new Error(body?.error ?? `HTTP ${e.response.status}`)
  }
  return e instanceof Error ? e : new Error('Network error')
}

export function useAddItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { productId: number; quantity: number }) => {
      try {
        return await api.post('cart/items', { json: input }).json<{ ok: true }>()
      } catch (e) {
        throw await parseCartError(e)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CART_KEY })
      toast.success('Added to cart')
    },
    onError: (err) => toast.error(friendlyOf(err.message)),
  })
}
