import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as meGET } from '@/app/api/auth/me/route'
import { POST as logoutPOST } from '@/app/api/auth/logout/route'
import { setupDb, truncateAll } from '../../setup/db'
import { clearSession, getSessionSpies, setSession } from '../../setup/session'

beforeAll(() => {
  setupDb()
})

beforeEach(async () => {
  await truncateAll()
  clearSession()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/auth/me', () => {
  it('returns { user: null } when no session', async () => {
    const res = await meGET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const json = (await res.json()) as { user: unknown }
    expect(json.user).toBeNull()
  })

  it('returns the user when session is set', async () => {
    setSession({ id: 1, email: 'a@b.co', name: 'A' })
    const res = await meGET()
    expect(res.status).toBe(200)
    const json = (await res.json()) as { user: { email: string } }
    expect(json.user.email).toBe('a@b.co')
  })
})

describe('POST /api/auth/logout', () => {
  it('returns { ok: true } and calls session.destroy', async () => {
    setSession({ id: 1, email: 'a@b.co', name: 'A' })
    const res = await logoutPOST()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const json = (await res.json()) as { ok: boolean }
    expect(json.ok).toBe(true)
    expect(getSessionSpies().destroy).toHaveBeenCalled()
  })
})
