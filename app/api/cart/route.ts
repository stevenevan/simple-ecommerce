import { ensureSession } from '@/lib/auth'
import { getOrCreateCart, listCartItems } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const user = await ensureSession()
  if (user instanceof Response) return user

  const cart = await getOrCreateCart(user.id)
  const items = await listCartItems(cart.id)
  const subtotalCents = items.reduce((s, i) => s + i.line_total_cents, 0)

  return Response.json({ items, subtotalCents }, { headers: NO_STORE })
}
