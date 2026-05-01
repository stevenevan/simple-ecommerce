'use client'

// Load-bearing — every mutation toasts on success/error.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { friendlyOf } from './_friendlyErrors'

async function parseCartError(e: unknown): Promise<Error> {
  if (e instanceof HTTPError) {
    const body = await e.response.json<{ error?: string }>().catch(() => null)
    return new Error(body?.error ?? `HTTP ${e.response.status}`)
  }
  return e instanceof Error ? e : new Error('Network error')
}

function invalidateCart(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['cart'] })
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
      invalidateCart(qc)
      toast.success('Added to cart')
    },
    onError: (err) => toast.error(friendlyOf(err.message)),
  })
}

export function useUpdateQty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; quantity: number }) => {
      try {
        return await api.patch(`cart/items/${input.id}`, { json: { quantity: input.quantity } }).json<{ ok: true }>()
      } catch (e) {
        throw await parseCartError(e)
      }
    },
    onSuccess: () => {
      invalidateCart(qc)
      toast.success('Cart updated')
    },
    onError: (err) => toast.error(friendlyOf(err.message)),
  })
}

export function useRemoveItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number }) => {
      try {
        return await api.delete(`cart/items/${input.id}`).json<{ ok: true }>()
      } catch (e) {
        throw await parseCartError(e)
      }
    },
    onSuccess: () => {
      invalidateCart(qc)
      toast.success('Removed')
    },
    onError: (err) => toast.error(friendlyOf(err.message)),
  })
}
