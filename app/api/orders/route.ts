import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { ensureSession } from '@/lib/auth'
import { placeOrderSchema } from '@/lib/schemas/checkout'
import { createOrderForUser, listOrdersForUser } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_BODY_BYTES = 10_000

export async function GET() {
  const user = await ensureSession()
  if (user instanceof Response) return user
  const orders = await listOrdersForUser(user.id)
  return Response.json({ orders }, { headers: NO_STORE })
}

export async function POST(req: NextRequest) {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_BODY_BYTES) {
    return Response.json({ error: 'payload_too_large' }, { status: 413, headers: NO_STORE })
  }

  const user = await ensureSession()
  if (user instanceof Response) return user

  const body = await req.json().catch(() => null)

  // nothing_selected pre-check (more specific than the schema's invalid_form envelope)
  if (
    body !== null &&
    typeof body === 'object' &&
    Array.isArray((body as { selectedItemIds?: unknown }).selectedItemIds) &&
    (body as { selectedItemIds: unknown[] }).selectedItemIds.length === 0
  ) {
    return Response.json({ error: 'nothing_selected' }, { status: 400, headers: NO_STORE })
  }

  const parsed = placeOrderSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_form', fields: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers: NO_STORE },
    )
  }

  try {
    const { id } = await createOrderForUser(user.id, parsed.data)
    return Response.json({ id }, { headers: NO_STORE })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'cart_empty') {
      return Response.json({ error: 'cart_empty' }, { status: 400, headers: NO_STORE })
    }
    if (msg === 'insufficient_stock') {
      return Response.json({ error: 'insufficient_stock' }, { status: 409, headers: NO_STORE })
    }
    console.error('POST /api/orders failed:', e)
    return Response.json({ error: 'server_error' }, { status: 500, headers: NO_STORE })
  }
}
