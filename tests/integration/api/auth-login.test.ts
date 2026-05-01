import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { POST } from '@/app/api/auth/login/route'
import { seedUser, setupDb, truncateAll } from '../../setup/db'
import { clearSession, getSessionSpies } from '../../setup/session'
import { makeJsonRequest } from '../../setup/request'

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

describe('POST /api/auth/login', () => {
  it('413 on oversize content-length', async () => {
    const req = makeJsonRequest('/api/auth/login', {
      method: 'POST',
      body: '{}',
      contentLengthOverride: '20000',
    })
    const res = await POST(req)
    expect(res.status).toBe(413)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('400 invalid_form on malformed body, with fields error map', async () => {
    const req = makeJsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'bad', password: 'short' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string; fields: Record<string, string[]> }
    expect(json.error).toBe('invalid_form')
    expect(json.fields).toBeDefined()
  })

  it('400 invalid_form on null body (req.json fails)', async () => {
    const req = makeJsonRequest('/api/auth/login', {
      method: 'POST',
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('401 invalid_credentials on unknown email; bcrypt.compare runs against DUMMY_HASH', async () => {
    const spy = vi.spyOn(bcrypt, 'compare')
    const req = makeJsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'nobody@nope.co', password: 'doesnotmatter1' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('invalid_credentials')

    // Timing equalization: compare ran exactly once with a bcrypt-shaped hash
    expect(spy).toHaveBeenCalledTimes(1)
    const hashArg = spy.mock.calls[0][1]
    expect(typeof hashArg).toBe('string')
    expect((hashArg as string).startsWith('$2')).toBe(true)
  })

  it('401 invalid_credentials on wrong password for existing user', async () => {
    await seedUser({ email: 'real@nope.co', password: 'realpass1' })
    const req = makeJsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'real@nope.co', password: 'wrongpass1' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('200 on success: returns user, calls session.save, no-store', async () => {
    await seedUser({ email: 'real@nope.co', password: 'realpass1', name: 'Real' })
    const req = makeJsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'real@nope.co', password: 'realpass1' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const json = (await res.json()) as { user: { email: string; name: string } }
    expect(json.user.email).toBe('real@nope.co')
    expect(json.user.name).toBe('Real')
    expect(getSessionSpies().save).toHaveBeenCalled()
  })
})
