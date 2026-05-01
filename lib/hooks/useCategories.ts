'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

const FIVE_MINUTES_MS = 5 * 60_000

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        return await api.get('products/categories').json<string[]>()
      } catch (e) {
        // Decorative metadata: failure should not break the catalog.
        // Log so the dev console still shows the issue, then re-throw so TanStack
        // sets isError. FilterBar reads `data ?? []` and falls back to "All" only.
        console.error('useCategories failed', e)
        throw e
      }
    },
    staleTime: FIVE_MINUTES_MS,
  })
}
