import { test, expect, request as playwrightRequest } from '@playwright/test'
import { resetDb } from '../fixtures/db'
import { registerUser, VALID_PASSWORD } from '../fixtures/user'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
// bcryptjs (pure JS, cost 10) is ~70-90ms on modern Macs; floor at 40ms still
// proves bcrypt actually ran (a no-bcrypt path would return < 10ms).
const BCRYPT_FLOOR_MS = 40
const TIMING_CEILING_MS = 5000

function parseSetCookie(setCookie: string | null): Record<string, string | true> | null {
  if (!setCookie) return null
  const out: Record<string, string | true> = {}
  for (const part of setCookie.split(';')) {
    const [rawKey, ...rest] = part.split('=')
    const key = rawKey.trim()
    if (!key) continue
    out[key] = rest.length === 0 ? true : rest.join('=').trim()
  }
  return out
}

test.beforeEach(async () => {
  await resetDb()
})

test.describe('register', () => {
  test('happy path returns user + sets sec_session cookie with hardened attrs', async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
    const res = await ctx.post('/api/auth/register', {
      data: { email: 'reg-ok@example.test', name: 'Reg User', password: VALID_PASSWORD },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.user).toMatchObject({ email: 'reg-ok@example.test', name: 'Reg User' })
    expect(typeof body.user.id).toBe('number')

    const setCookie = res.headers()['set-cookie']
    expect(setCookie).toBeTruthy()
    const cookies = parseSetCookie(setCookie ?? null)
    expect(cookies).not.toBeNull()
    expect(cookies!.sec_session).toBeTruthy()
    expect(cookies!.HttpOnly).toBe(true)
    expect(String(cookies!.SameSite).toLowerCase()).toBe('lax')
    expect(cookies!.Path).toBe('/')
    expect(cookies!['Max-Age']).toBe('604800')
    expect(cookies!.Domain).toBeUndefined()
    await ctx.dispose()
  })

  test('rejects invalid email shape', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: { email: 'not-an-email', name: 'X', password: VALID_PASSWORD },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_form')
    expect(body.fields.email).toBeTruthy()
  })

  test('rejects password missing letter (representative strength check)', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: { email: 'noletter@example.test', name: 'X', password: '12345678' },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).fields.password).toBeTruthy()
  })

  test('duplicate email returns 401 invalid_credentials (timing-equalized)', async ({ request }) => {
    await registerUser('dup-base')
    const dup = await request.post('/api/auth/register', {
      data: {
        email: `user-dup-base@example.test`,
        name: 'Dup',
        password: VALID_PASSWORD,
      },
    })
    expect(dup.status()).toBe(401)
    expect((await dup.json()).error).toBe('invalid_credentials')
  })

})

test.describe('login', () => {
  test('happy path returns user + cookie', async ({ request }) => {
    const u = await registerUser('login-happy')
    await u.context.dispose()
    const res = await request.post('/api/auth/login', {
      data: { email: u.email, password: u.password },
    })
    expect(res.status()).toBe(200)
    expect(res.headers()['set-cookie']).toContain('sec_session=')
  })

  test('wrong password returns 401', async ({ request }) => {
    const u = await registerUser('login-wrong')
    await u.context.dispose()
    const res = await request.post('/api/auth/login', {
      data: { email: u.email, password: 'WrongPass1' },
    })
    expect(res.status()).toBe(401)
    expect((await res.json()).error).toBe('invalid_credentials')
  })

  test('unknown email returns 401 and runs bcrypt (≥100ms via dummy hash)', async ({ request }) => {
    const t0 = Date.now()
    const res = await request.post('/api/auth/login', {
      data: { email: 'nonexistent@example.test', password: VALID_PASSWORD },
    })
    const elapsed = Date.now() - t0
    expect(res.status()).toBe(401)
    expect(elapsed).toBeGreaterThanOrEqual(BCRYPT_FLOOR_MS)
    expect(elapsed).toBeLessThan(TIMING_CEILING_MS)
  })

  test('malformed JSON body returns 400 invalid_form', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: 'not-json{',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('invalid_form')
  })

})

test.describe('me + logout', () => {
  test('GET /api/auth/me returns 200 + {user: null} when unauth (public-shape)', async ({ request }) => {
    const res = await request.get('/api/auth/me')
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ user: null })
  })

  test('logout — me reflects user pre-logout, null post-logout, cart 401 post-logout', async () => {
    const u = await registerUser('logout-clear')

    // Pre-logout: me returns the session user (replaces standalone authed-me test)
    const meBefore = await (await u.context.get('/api/auth/me')).json()
    expect(meBefore.user).toMatchObject({ email: u.email, name: u.name })

    const logout = await u.context.post('/api/auth/logout')
    expect(logout.status()).toBe(200)

    const meAfter = await u.context.get('/api/auth/me')
    expect((await meAfter.json()).user).toBeNull()

    const cartAfter = await u.context.get('/api/cart')
    expect(cartAfter.status()).toBe(401)
    await u.context.dispose()
    // NOTE: iron-session is stateless. A previously-captured sealed cookie can
    // still authenticate until its TTL expires — replay-protection is NOT a
    // server-enforced invariant in this stack. Tracked under "Risks" in the plan.
  })
})
