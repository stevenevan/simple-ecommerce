// Workshop rule (article 01 ICCAF): tests encode OUR acceptance criteria,
// not the library's stock behavior. Pure-zod-validator tests removed
// (z.email() coverage, "accepts valid input" boilerplate). Boundary tests
// pin OUR numeric/regex/refinement/transform rules.

import { describe, expect, it } from 'vitest'
import { loginSchema, registerSchema } from '@/lib/schemas/auth'
import { checkoutShippingSchema } from '@/lib/schemas/checkout'

describe('loginSchema', () => {
  const ok = { email: 'a@b.co', password: 'aaaaaaaa' }

  it('rejects email > 254 chars', () => {
    const long = 'a'.repeat(250) + '@b.co'
    expect(loginSchema.safeParse({ ...ok, email: long }).success).toBe(false)
  })

  it('rejects password < 8 chars', () => {
    expect(loginSchema.safeParse({ ...ok, password: 'aaa' }).success).toBe(false)
  })

  it('rejects password > 200 chars', () => {
    expect(loginSchema.safeParse({ ...ok, password: 'a'.repeat(201) }).success).toBe(false)
  })
})

describe('registerSchema', () => {
  const ok = { email: 'a@b.co', name: 'A', password: 'pass1234' }

  it('rejects password without letter', () => {
    expect(registerSchema.safeParse({ ...ok, password: '12345678' }).success).toBe(false)
  })

  it('rejects password without digit', () => {
    expect(registerSchema.safeParse({ ...ok, password: 'abcdefgh' }).success).toBe(false)
  })

  it('rejects empty name', () => {
    expect(registerSchema.safeParse({ ...ok, name: '' }).success).toBe(false)
  })

  it('rejects name > 80 chars', () => {
    expect(registerSchema.safeParse({ ...ok, name: 'a'.repeat(81) }).success).toBe(false)
  })

  it('DoS bound: rejects 1M-char name fast (max(80) gates before any expensive work)', () => {
    const t = Date.now()
    const r = registerSchema.safeParse({ ...ok, name: 'a'.repeat(1_000_000) })
    expect(r.success).toBe(false)
    expect(Date.now() - t).toBeLessThan(500)
  })
})

describe('checkoutShippingSchema', () => {
  const ok = { name: 'Jane', address: '1 St', city: 'NYC', zip: '12345' }

  it('rejects 3-digit zip (our 4-min boundary)', () => {
    expect(checkoutShippingSchema.safeParse({ ...ok, zip: '123' }).success).toBe(false)
  })

  it('rejects 11-digit zip (our 10-max boundary)', () => {
    expect(checkoutShippingSchema.safeParse({ ...ok, zip: '12345678901' }).success).toBe(false)
  })

  it('rejects alpha in zip (our digits-only regex — char class)', () => {
    expect(checkoutShippingSchema.safeParse({ ...ok, zip: '12abc' }).success).toBe(false)
  })

  it('rejects hyphenated zip (our digits-only regex — separator)', () => {
    expect(checkoutShippingSchema.safeParse({ ...ok, zip: '12345-6789' }).success).toBe(false)
  })

  it('trims name/address/city', () => {
    const r = checkoutShippingSchema.safeParse({
      ...ok,
      name: '  Jane  ',
      address: '  1 St  ',
      city: '  NYC  ',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.name).toBe('Jane')
      expect(r.data.address).toBe('1 St')
      expect(r.data.city).toBe('NYC')
    }
  })

  it('rejects name > 120 chars', () => {
    expect(checkoutShippingSchema.safeParse({ ...ok, name: 'a'.repeat(121) }).success).toBe(false)
  })
})
