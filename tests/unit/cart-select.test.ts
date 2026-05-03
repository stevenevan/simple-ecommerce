// Workshop rule (article 02): unit tests are deterministic, no DOM. Asserts
// the contract — pure subtotal reducer + zod-schema rejections — not free text.

import { describe, expect, it } from 'vitest'
import { placeOrderSchema } from '@/lib/schemas/checkout'
import type { CartItemView } from '@/lib/types'

// Inlined mirror of the selected-subtotal reduce that lives in
// app/_components/CartDrawer.tsx and app/checkout/page.tsx.
// Importing from those modules would drag the React/Next runtime into
// a pure unit test — keep the 3-line mirror here instead.
function selectedSubtotalCents(
  items: readonly CartItemView[],
  selected: ReadonlySet<number>,
): number {
  return items
    .filter((it) => selected.has(it.id))
    .reduce((sum, it) => sum + it.line_total_cents, 0)
}

const row = (id: number, lineTotalCents: number): CartItemView =>
  ({
    id,
    productId: id,
    slug: `p${id}`,
    name: `Product ${id}`,
    image_url: `/p${id}.png`,
    price_cents: lineTotalCents,
    quantity: 1,
    line_total_cents: lineTotalCents,
    stock: 10,
  }) as CartItemView

describe('selectedSubtotalCents', () => {
  it('subtotal recomputes when one row is excluded', () => {
    const items = [row(10, 1000), row(20, 500)]
    const selected = new Set<number>([10])
    expect(selectedSubtotalCents(items, selected)).toBe(1000)
  })
})

describe('placeOrderSchema', () => {
  const ok = {
    name: 'Jane',
    address: '1 St',
    city: 'NYC',
    zip: '12345',
    selectedItemIds: [1],
  }

  it('schema rejects empty selectedItemIds', () => {
    expect(placeOrderSchema.safeParse({ ...ok, selectedItemIds: [] }).success).toBe(false)
  })

  it('schema rejects non-positive integers in selectedItemIds', () => {
    expect(placeOrderSchema.safeParse({ ...ok, selectedItemIds: [0] }).success).toBe(false)
    expect(placeOrderSchema.safeParse({ ...ok, selectedItemIds: [-1] }).success).toBe(false)
    expect(placeOrderSchema.safeParse({ ...ok, selectedItemIds: [1.5] }).success).toBe(false)
  })
})
