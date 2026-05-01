'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import type { LoginInput, RegisterInput, SessionUserParsed as SessionUser } from '@/lib/schemas/auth'

type AuthSuccess = { user: SessionUser }

async function parseAuthError(e: unknown): Promise<Error> {
  if (e instanceof HTTPError) {
    const body = await e.response.json<{ error?: string }>().catch(() => null)
    return new Error(body?.error ?? `HTTP ${e.response.status}`)
  }
  return e instanceof Error ? e : new Error('Network error')
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      try {
        return await api.post('auth/login', { json: input }).json<AuthSuccess>()
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
