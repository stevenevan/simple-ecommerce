'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { SessionUserParsed as SessionUser } from '@/lib/schemas/auth'

// Load-bearing: header + page guards depend on this resolving. staleTime=0
// overrides the global 30s default so post-login/logout invalidations refetch
// immediately. Server-side SessionUser lives in lib/session.ts; the schema
// shape in lib/schemas/auth is structurally identical and safe for the client.
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('auth/me').json<{ user: SessionUser | null }>(),
    staleTime: 0,
  })
}
