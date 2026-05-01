import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { registerSchema } from '@/lib/schemas/auth'
import { hashPassword } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getUserByEmail, insertUser } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 10_000
const NO_STORE = { 'Cache-Control': 'no-store' }

function invalidCredentials(): Response {
  return Response.json({ error: 'invalid_credentials' }, { status: 401, headers: NO_STORE })
}

export async function POST(req: NextRequest) {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_BODY_BYTES) {
    return Response.json({ error: 'payload_too_large' }, { status: 413, headers: NO_STORE })
  }

  const json = await req.json().catch(() => null)
  const parsed = registerSchema.safeParse(json)
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_form', fields: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers: NO_STORE },
    )
  }

  const { email, name, password } = parsed.data

  // Hash BEFORE branch decision — duplicate-path wall-clock matches success path.
  const passwordHash = await hashPassword(password)

  if (await getUserByEmail(email)) {
    return invalidCredentials()
  }

  const { id } = await insertUser(email, passwordHash, name)
  const session = await getSession()
  session.user = { id, email, name }
  await session.save()

  return Response.json({ user: session.user }, { headers: NO_STORE })
}
