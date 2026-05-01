import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST() {
  const session = await getSession()
  await session.destroy()
  return Response.json({ ok: true }, { headers: NO_STORE })
}
