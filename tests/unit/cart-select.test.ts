import { describe, expect, it } from 'vitest'
import { placeOrderSchema } from '@/lib/schemas/checkout'
import type { CartItemView } from '@/lib/types'

// Mirrors the inline reducer in app/_components/CartDrawer.tsx + app/checkout/page.tsx.
// No exported helper exists in production; pure mirror keeps this test deterministic
// (no jsdom, no @testing-library/react).
const subtotalOf = (
  items: Pick<CartItemView, 'id' | 'line_total_cents'>[],
  excluded: Set<number>,
) => items.filter((it) => !excluded.has(it.id)).reduce((s, it) => s + it.line_total_cents, 0)

describe('cart selection subtotal', () => {
  it('subtotal recomputes when one row is excluded', () => {
    const rows = [
      { id: 1, line_total_cents: 1000 },
      { id: 2, line_total_cents: 500 },
    ]
    expect(subtotalOf(rows, new Set([2]))).toBe(1000)
  })
})

describe('placeOrderSchema selectedItemIds', () => {
  const validShipping = { name: 'Jane', address: '1 St', city: 'NYC', zip: '12345' }

  it('schema rejects empty selectedItemIds', () => {
    expect(
      placeOrderSchema.safeParse({ ...validShipping, selectedItemIds: [] }).success,
    ).toBe(false)
  })

  it('schema rejects non-positive integers in selectedItemIds', () => {
    expect(
      placeOrderSchema.safeParse({ ...validShipping, selectedItemIds: [0] }).success,
    ).toBe(false)
    expect(
      placeOrderSchema.safeParse({ ...validShipping, selectedItemIds: [-1] }).success,
    ).toBe(false)
    expect(
      placeOrderSchema.safeParse({ ...validShipping, selectedItemIds: [1.5] }).success,
    ).toBe(false)
  })
})
