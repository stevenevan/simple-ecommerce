import { describe, expect, it } from 'vitest'
import { formatCurrency } from '@/lib/format'

describe('formatCurrency', () => {
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })
})

// Workshop deck page 04 — vitest 3-layer assertion model on a deterministic
// transform. Shape (regex) → Contract (must / must-not contain) → Invariant
// (deterministic domain rule).
describe('formatCurrency — workshop 3-layer demo', () => {
  // SHAPE — regex contract.
  it.each([0, 99, 100, 100_000, 9_999_999])(
    'output for %i matches /^\\$\\d+(,\\d{3})*\\.\\d{2}$/',
    (cents) => expect(formatCurrency(cents)).toMatch(/^\$\d+(,\d{3})*\.\d{2}$/),
  )

  // CONTRACT — must-contain / must-not-contain.
  it('always contains "$" and never contains a non-USD symbol', () => {
    const out = formatCurrency(123_456)
    expect(out).toContain('$')
    expect(out).not.toMatch(/[€£¥₹]/)
  })

  // INVARIANT — deterministic domain rule.
  // No line-items sum exists for `formatCurrency` itself (the canonical deck
  // example `total === sum(lineItems[].amount)` lives at orders.spec.ts).
  // Closest invariant for a single scalar formatter: parse-back monotonicity.
  it('monotonic: cents_a > cents_b ⇒ parse(format(cents_a)) > parse(format(cents_b))', () => {
    const parse = (s: string) => Number(s.replace(/[^0-9.]/g, ''))
    expect(parse(formatCurrency(100))).toBeGreaterThan(parse(formatCurrency(99)))
  })
})
