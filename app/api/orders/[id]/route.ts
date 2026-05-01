import { ensureSession } from '@/lib/auth'
import { getOrderForUser } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const user = await ensureSession()
  if (user instanceof Response) return user

  const { id } = await params
  const orderId = Number(id)
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  const data = await getOrderForUser(user.id, orderId)
  if (!data) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }
  return Response.json(data, { headers: NO_STORE })
}
