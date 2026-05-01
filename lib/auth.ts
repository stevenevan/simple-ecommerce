import bcrypt from 'bcryptjs'
import { getSession, type SessionUser } from './session.ts'

const BCRYPT_COST = 10

export const hashPassword = (pw: string) => bcrypt.hash(pw, BCRYPT_COST)
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash)

export async function ensureSession(): Promise<SessionUser | Response> {
  const session = await getSession()
  if (!session.user) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  return session.user
}
