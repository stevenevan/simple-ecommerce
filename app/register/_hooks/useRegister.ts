'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import type { RegisterInput, SessionUserParsed as SessionUser } from '@/lib/schemas/auth'

type AuthSuccess = { user: SessionUser }

// Mirrors parseAuthError in app/login/_hooks/useLogin.ts and
// app/_hooks/useLogout.ts; keep in sync.
async function parseAuthError(e: unknown): Promise<Error> {
  if (e instanceof HTTPError) {
    const body = await e.response.json<{ error?: string }>().catch(() => null)
    return new Error(body?.error ?? `HTTP ${e.response.status}`)
  }
  return e instanceof Error ? e : new Error('Network error')
}

export function useRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      try {
        return await api.post('auth/register', { json: input }).json<AuthSuccess>()
      } catch (e) {
        throw await parseAuthError(e)
      }
    },
    onSuccess: ({ user }) => {
      qc.setQueryData(['me'], { user })
      qc.invalidateQueries({ queryKey: ['cart'] })
    },
    onError: (err) => toast.error(err.message),
  })
}
