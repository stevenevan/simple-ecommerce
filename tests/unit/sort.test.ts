import { describe, expect, it } from 'vitest'
import { isClientSortKey, CLIENT_SORT_KEYS } from '@/lib/sort'

describe('isClientSortKey', () => {
  it.each(CLIENT_SORT_KEYS)('accepts %s', (k) => {
    expect(isClientSortKey(k)).toBe(true)
  })

  it('rejects null', () => {
    expect(isClientSortKey(null)).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isClientSortKey(undefined)).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isClientSortKey('')).toBe(false)
  })

  it('rejects unknown key', () => {
    expect(isClientSortKey('foo')).toBe(false)
  })

  it('rejects SQL-ish injection string', () => {
    expect(isClientSortKey('price_asc; DROP TABLE products')).toBe(false)
  })
})
