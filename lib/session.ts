import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export type SessionUser = { id: number; email: string; name: string }
export type SessionData = { user?: SessionUser }

const MIN_SECRET_LEN = 32

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < MIN_SECRET_LEN) {
  throw new Error('SESSION_SECRET must be set and at least 32 chars')
}

export const sessionOptions: SessionOptions = {
  cookieName: 'sec_session',
  password: process.env.SESSION_SECRET,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  },
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions)
}
