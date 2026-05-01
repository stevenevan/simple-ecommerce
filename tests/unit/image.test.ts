import { describe, expect, it } from 'vitest'
import { safeProductImage } from '@/lib/image'

const PLACEHOLDER = '/seed-images/_placeholder.svg'

describe('safeProductImage', () => {
  it('accepts same-origin path', () => {
    expect(safeProductImage('/seed-images/x.jpg')).toBe('/seed-images/x.jpg')
  })

  it('rejects protocol-relative URL', () => {
    expect(safeProductImage('//evil.com/x.jpg')).toBe(PLACEHOLDER)
  })

  it('rejects https URL', () => {
    expect(safeProductImage('https://evil.com/x.jpg')).toBe(PLACEHOLDER)
  })

  it('rejects data URI', () => {
    expect(safeProductImage('data:image/png;base64,AAAA')).toBe(PLACEHOLDER)
  })

  it('rejects empty string', () => {
    expect(safeProductImage('')).toBe(PLACEHOLDER)
  })

  it('rejects undefined', () => {
    expect(safeProductImage(undefined)).toBe(PLACEHOLDER)
  })

  it('rejects null', () => {
    expect(safeProductImage(null)).toBe(PLACEHOLDER)
  })

  it('rejects non-string (defense-in-depth)', () => {
    expect(safeProductImage(123 as unknown as string)).toBe(PLACEHOLDER)
  })
})
