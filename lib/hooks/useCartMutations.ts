'use client'

// Load-bearing — every mutation toasts on success/error.
//
// Convention: mutations that edit existing rows by client-known id
// (useUpdateQty, useRemoveItem) use optimistic onMutate + onSettled reconcile.
// Mutations that create rows or have multi-resource side effects (useAddItem,
// useCreateOrder) stay round-trip — fabricating server-issued ids is brittle.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { CART_KEY, type CartResponse } from './useCart'
import { friendlyOf } from './_friendlyErrors'

async function parseCartError(e: unknown): Promise<Error> {
  if (e instanceof HTTPError) {
    const body = await e.response.json<{ error?: string }>().catch(() => null)
    return new Error(body?.error ?? `HTTP ${e.response.status}`)
  }
  return e instanceof Error ? e : new Error('Network error')
}

function invalidateCart(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: CART_KEY })
}

export function useAddItem() {
  const qc = useQueryClient()
  return useMutation({
    // Not optimistic: cart_item.id is server-issued. Fabricating a temp id is
    // brittle (de-dup, rollback, concurrent adds). Round-trip is acceptable here.
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
    onMutate: async ({ id, quantity }) => {
      await qc.cancelQueries({ queryKey: CART_KEY })
      const prev = qc.getQueryData<CartResponse>(CART_KEY)
      if (prev) {
        const items = prev.items.map((i) => {
          if (i.id !== id) return i
          const clamped = Math.min(Math.max(quantity, 1), i.stock)
          return { ...i, quantity: clamped, line_total_cents: i.price_cents * clamped }
        })
        const subtotalCents = items.reduce((s, i) => s + i.line_total_cents, 0)
        qc.setQueryData<CartResponse>(CART_KEY, { items, subtotalCents })
      }
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(CART_KEY, ctx.prev)
      toast.error(friendlyOf(err.message))
    },
    onSuccess: () => toast.success('Cart updated'),
    onSettled: () => { invalidateCart(qc) },
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
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: CART_KEY })
      const prev = qc.getQueryData<CartResponse>(CART_KEY)
      if (prev) {
        const items = prev.items.filter((i) => i.id !== id)
        const subtotalCents = items.reduce((s, i) => s + i.line_total_cents, 0)
        qc.setQueryData<CartResponse>(CART_KEY, { items, subtotalCents })
      }
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(CART_KEY, ctx.prev)
      toast.error(friendlyOf(err.message))
    },
    onSuccess: () => toast.success('Removed'),
    onSettled: () => { invalidateCart(qc) },
  })
}
