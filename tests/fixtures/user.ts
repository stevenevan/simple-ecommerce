import { request as playwrightRequest, expect, type APIRequestContext } from '@playwright/test'
import { getUserIdByEmail } from './db'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
const VALID_PASSWORD = 'Passw0rd!'

let counter = 0

export type RegisteredUser = {
  context: APIRequestContext
  email: string
  password: string
  name: string
  userId: number
}

function uniqueEmail(suffix?: string): string {
  counter += 1
  const tag = suffix ?? `${Date.now()}-${counter}`
  return `user-${tag}@example.test`
}

export async function registerUser(suffix?: string): Promise<RegisteredUser> {
  const email = uniqueEmail(suffix)
  const name = 'Test User'
  const password = VALID_PASSWORD
  const context = await playwrightRequest.newContext({ baseURL: BASE_URL })
  const res = await context.post('/api/auth/register', {
    data: { email, name, password },
  })
  expect(res.status(), `register ${email} failed`).toBe(200)
  const userId = await getUserIdByEmail(email)
  return { context, email, password, name, userId }
}

export { VALID_PASSWORD }
