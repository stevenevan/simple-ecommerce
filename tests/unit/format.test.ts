import { describe, expect, it } from 'vitest'
import { formatCurrency } from '@/lib/format'

describe('formatCurrency', () => {
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })
})
