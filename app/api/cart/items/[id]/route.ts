import type { NextRequest } from 'next/server'
import { ensureSession } from '@/lib/auth'
import {
  getCartItemOwnership,
  getOrCreateCart,
  getProductForCart,
  removeCartItem,
  updateCartItemQty,
} from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_BODY_BYTES = 10_000
const MAX_QUANTITY = 999

type Ctx = { params: Promise<{ id: string }> }

function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_BODY_BYTES) {
    return Response.json({ error: 'payload_too_large' }, { status: 413, headers: NO_STORE })
  }

  const user = await ensureSession()
  if (user instanceof Response) return user

  const { id } = await params
  const itemId = parseId(id)
  if (itemId === null) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  const body = await req.json().catch(() => null) as { quantity?: unknown } | null
  const quantity = body?.quantity
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return Response.json({ error: 'invalid_form' }, { status: 400, headers: NO_STORE })
  }

  const cart = await getOrCreateCart(user.id)

  const productId = await getCartItemOwnership(itemId, cart.id)
  if (productId === null) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  const product = await getProductForCart(productId)
  if (!product) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  if (quantity > product.stock) {
    return Response.json({ error: 'insufficient_stock' }, { status: 409, headers: NO_STORE })
  }

  const changes = await updateCartItemQty(itemId, cart.id, quantity)
  if (changes === 0) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  return Response.json({ ok: true }, { headers: NO_STORE })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await ensureSession()
  if (user instanceof Response) return user

  const { id } = await params
  const itemId = parseId(id)
  if (itemId === null) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  const cart = await getOrCreateCart(user.id)
  const changes = await removeCartItem(itemId, cart.id)
  if (changes === 0) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  return Response.json({ ok: true }, { headers: NO_STORE })
}
