import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const session = await getSession().catch(() => null)
  return Response.json({ user: session?.user ?? null }, { headers: NO_STORE })
}
