import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/auth/register/route'
import { kdb } from '@/lib/db/kysely'
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

const validBody = { email: 'new@nope.co', name: 'New', password: 'Pass1234' }

describe('POST /api/auth/register', () => {
  it('413 on oversize content-length', async () => {
    const req = makeJsonRequest('/api/auth/register', {
      method: 'POST',
      body: '{}',
      contentLengthOverride: '20000',
    })
    const res = await POST(req)
    expect(res.status).toBe(413)
  })

  it.each([
    { label: 'short password', body: { ...validBody, password: 'Pass1' } },
    { label: 'no digit', body: { ...validBody, password: 'Password' } },
    { label: 'no letter', body: { ...validBody, password: '12345678' } },
    { label: 'missing name', body: { ...validBody, name: '' } },
    { label: 'malformed email', body: { ...validBody, email: 'bad' } },
  ])('400 invalid_form on $label', async ({ body }) => {
    const res = await POST(makeJsonRequest('/api/auth/register', { method: 'POST', body }))
    expect(res.status).toBe(400)
  })

  it('duplicate email returns invalid_credentials (NOT email_taken — enumeration prevention)', async () => {
    await seedUser({ email: 'dup@nope.co', password: 'whatever1' })
    const res = await POST(makeJsonRequest('/api/auth/register', {
      method: 'POST',
      body: { ...validBody, email: 'dup@nope.co' },
    }))
    expect(res.status).toBe(401)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('invalid_credentials')
  })

  it('200 on success: user inserted with hashed password, session populated', async () => {
    const res = await POST(makeJsonRequest('/api/auth/register', { method: 'POST', body: validBody }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')

    const row = await kdb
      .selectFrom('users')
      .selectAll()
      .where('email', '=', validBody.email)
      .executeTakeFirstOrThrow()
    expect(row.name).toBe('New')
    expect(row.password_hash.startsWith('$2')).toBe(true)
    expect(row.password_hash).not.toBe(validBody.password)
    expect(getSessionSpies().save).toHaveBeenCalled()
  })

  it('mass assignment: extra fields in request body are ignored', async () => {
    const res = await POST(makeJsonRequest('/api/auth/register', {
      method: 'POST',
      body: {
        ...validBody,
        email: 'mass@nope.co',
        isAdmin: true,
        role: 'admin',
        id: 9999,
        created_at: '2000-01-01',
        password_hash: 'pretend-hash',
      },
    }))
    expect(res.status).toBe(200)

    const row = await kdb
      .selectFrom('users')
      .selectAll()
      .where('email', '=', 'mass@nope.co')
      .executeTakeFirstOrThrow()
    expect(row.id).not.toBe(9999) // assigned by DB
    expect(row.password_hash).not.toBe('pretend-hash') // set by hashPassword
    expect(row.created_at).not.toBe('2000-01-01') // DB default
    // Response shape echoes only schema-defined fields
    const json = (await res.json()) as { user: Record<string, unknown> }
    expect(Object.keys(json.user).sort()).toEqual(['email', 'id', 'name'])
  })

  it('prototype pollution payload does not pollute Object.prototype', async () => {
    const before = (Object.prototype as unknown as { polluted?: number }).polluted
    const res = await POST(makeJsonRequest('/api/auth/register', {
      method: 'POST',
      body: '{"__proto__":{"polluted":1},"email":"pp@nope.co","name":"PP","password":"Pass1234"}',
    }))
    // Either 200 (success) or 400 (rejected) — what matters is no pollution
    expect([200, 400]).toContain(res.status)
    expect((Object.prototype as unknown as { polluted?: number }).polluted).toBe(before)
  })
})
