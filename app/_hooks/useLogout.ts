'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'

// Mirrors parseAuthError in app/login/_hooks/useLogin.ts and
// app/register/_hooks/useRegister.ts; keep in sync.
async function parseAuthError(e: unknown): Promise<Error> {
  if (e instanceof HTTPError) {
    const body = await e.response.json<{ error?: string }>().catch(() => null)
    return new Error(body?.error ?? `HTTP ${e.response.status}`)
  }
  return e instanceof Error ? e : new Error('Network error')
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      try {
        return await api.post('auth/logout').json<{ ok: true }>()
      } catch (e) {
        throw await parseAuthError(e)
      }
    },
    onSuccess: () => {
      qc.setQueryData(['me'], { user: null })
      qc.removeQueries({ queryKey: ['cart'] })
    },
    onError: (err) => {
      // Even on server error, drop client auth state — never strand user in
      // a "logged-in UI, no cookie" mismatch.
      qc.setQueryData(['me'], { user: null })
      qc.removeQueries({ queryKey: ['cart'] })
      toast.error(err.message)
    },
  })
}
