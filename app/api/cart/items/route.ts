import type { NextRequest } from 'next/server'
import { ensureSession } from '@/lib/auth'
import {
  getCartLineQuantity,
  getOrCreateCart,
  getProductForCart,
  upsertCartItem,
} from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_BODY_BYTES = 10_000
const MAX_QUANTITY = 999

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

export async function POST(req: NextRequest) {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_BODY_BYTES) {
    return Response.json({ error: 'payload_too_large' }, { status: 413, headers: NO_STORE })
  }

  const user = await ensureSession()
  if (user instanceof Response) return user

  const body = await req.json().catch(() => null) as { productId?: unknown; quantity?: unknown } | null
  if (!body || !isPositiveInt(body.productId) || !isPositiveInt(body.quantity) || body.quantity > MAX_QUANTITY) {
    return Response.json({ error: 'invalid_form' }, { status: 400, headers: NO_STORE })
  }
  const { productId, quantity } = body

  const product = await getProductForCart(productId)
  if (!product) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  const cart = await getOrCreateCart(user.id)
  const existingQty = await getCartLineQuantity(cart.id, productId)
  if (existingQty + quantity > product.stock) {
    return Response.json({ error: 'insufficient_stock' }, { status: 409, headers: NO_STORE })
  }

  await upsertCartItem(cart.id, productId, quantity)
  return Response.json({ ok: true }, { headers: NO_STORE })
}
