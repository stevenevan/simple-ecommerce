// UI state only — no fetch, no error surface.
// Not subject to the load-bearing/decorative classification (those describe
// fetching hooks). The TanStack Query cache is reused as a tiny cross-route
// store so the drawer's selection survives navigation to /checkout.
'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCart } from './useCart'

type SelectionState = { selected: Set<number>; known: Set<number> }
const EMPTY: SelectionState = { selected: new Set(), known: new Set() }

export const CART_SELECTION_KEY = ['cart-selection'] as const

export function useCartSelection() {
  const qc = useQueryClient()
  const cart = useCart()

  const { data: state = EMPTY } = useQuery<SelectionState>({
    queryKey: CART_SELECTION_KEY,
    queryFn: () => EMPTY,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  })

  // Reconcile when the cart row set changes: previously-known IDs respect
  // the user's prior choice; brand-new IDs default to selected; vanished IDs drop.
  useEffect(() => {
    const items = cart.data?.items
    if (!items) return
    qc.setQueryData<SelectionState>(CART_SELECTION_KEY, (prev = EMPTY) => {
      const next: SelectionState = { selected: new Set(), known: new Set() }
      for (const it of items) {
        next.known.add(it.id)
        const wasKnown = prev.known.has(it.id)
        if (!wasKnown || prev.selected.has(it.id)) next.selected.add(it.id)
      }
      return next
    })
  }, [cart.data?.items, qc])

  return {
    selectedIds: state.selected,
    isSelected: (id: number) => state.selected.has(id),
    toggle: (id: number) => {
      qc.setQueryData<SelectionState>(CART_SELECTION_KEY, (prev = EMPTY) => {
        const selected = new Set(prev.selected)
        if (selected.has(id)) selected.delete(id)
        else selected.add(id)
        return { selected, known: prev.known }
      })
    },
  }
}
