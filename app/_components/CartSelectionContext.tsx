'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

type Ctx = {
  isExcluded: (id: number) => boolean
  toggle: (id: number) => void
  prune: (currentItemIds: number[]) => void
}

const CartSelectionContext = createContext<Ctx | null>(null)

export function CartSelectionProvider({ children }: { children: React.ReactNode }) {
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(() => new Set())

  const isExcluded = useCallback((id: number) => excluded.has(id), [excluded])

  const toggle = useCallback((id: number) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const prune = useCallback((currentItemIds: number[]) => {
    setExcluded((prev) => {
      const present = new Set(currentItemIds)
      let changed = false
      const next = new Set<number>()
      for (const id of prev) {
        if (present.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [])

  const value = useMemo(() => ({ isExcluded, toggle, prune }), [isExcluded, toggle, prune])
  return <CartSelectionContext.Provider value={value}>{children}</CartSelectionContext.Provider>
}

export function useCartSelection() {
  const ctx = useContext(CartSelectionContext)
  if (!ctx) throw new Error('useCartSelection must be used inside <CartSelectionProvider>')
  return ctx
}
