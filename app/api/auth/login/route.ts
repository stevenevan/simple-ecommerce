import type { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { loginSchema } from '@/lib/schemas/auth'
import { getSession } from '@/lib/session'
import { getUserByEmail } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 10_000
const NO_STORE = { 'Cache-Control': 'no-store' }

// Module-level dummy hash for timing equalization on user-miss.
// Always run bcrypt.compare against either the real hash OR this — single code path.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

export async function POST(req: NextRequest) {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_BODY_BYTES) {
    return Response.json({ error: 'payload_too_large' }, { status: 413, headers: NO_STORE })
  }

  const json = await req.json().catch(() => null)
  const parsed = loginSchema.safeParse(json)
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_form', fields: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers: NO_STORE },
    )
  }

  const { email, password } = parsed.data

  const user = getUserByEmail(email)
  const hash = user?.password_hash ?? DUMMY_HASH
  const ok = await bcrypt.compare(password, hash)
  if (!user || !ok) {
    return Response.json({ error: 'invalid_credentials' }, { status: 401, headers: NO_STORE })
  }

  const session = await getSession()
  session.user = { id: user.id, email: user.email, name: user.name }
  await session.save()

  return Response.json({ user: session.user }, { headers: NO_STORE })
}
