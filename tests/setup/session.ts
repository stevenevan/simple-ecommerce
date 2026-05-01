// Mocks @/lib/session so route handlers can run under vitest's `node`
// environment without invoking next/headers:cookies() (which throws outside
// a Server Component / Server Action context).
//
// Wired via vitest.config.ts setupFiles. Test files import { setSession,
// getSessionMock } and toggle the user per case.
//
// Trade-off: this bypasses the real iron-session cookie machinery. Cookie
// attribute / fixation / clear-cookie assertions live in playwright e2e
// (tests/api/auth.spec.ts), not here. We assert response BODY + DB state
// + Cache-Control header (which is set on Response.json directly, not via
// iron-session).

import { vi } from 'vitest'
import type { SessionUser } from '@/lib/session'

type FakeSession = {
  user: SessionUser | null
  save: () => Promise<void>
  destroy: () => Promise<void>
}

const state: { user: SessionUser | null } = { user: null }
const saveSpy = vi.fn(async () => {})
const destroySpy = vi.fn(async () => {
  state.user = null
})

vi.mock('@/lib/session', async () => {
  // Re-export the type-only sessionOptions stub; routes only use getSession.
  return {
    getSession: vi.fn(async (): Promise<FakeSession> => ({
      get user() {
        return state.user
      },
      set user(v: SessionUser | null) {
        state.user = v
      },
      save: saveSpy,
      destroy: destroySpy,
    })),
    sessionOptions: {},
  }
})

export function setSession(user: SessionUser | null): void {
  state.user = user
}

export function clearSession(): void {
  state.user = null
  saveSpy.mockClear()
  destroySpy.mockClear()
}

export function getSessionSpies(): { save: typeof saveSpy; destroy: typeof destroySpy } {
  return { save: saveSpy, destroy: destroySpy }
}
