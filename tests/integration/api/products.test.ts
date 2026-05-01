import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as listGET } from '@/app/api/products/route'
import { GET as slugGET } from '@/app/api/products/[slug]/route'
import { GET as catGET } from '@/app/api/products/categories/route'
import { seedProduct, setupDb, truncateAll } from '../../setup/db'
import { makeJsonRequest } from '../../setup/request'
import type { NextRequest } from 'next/server'

beforeAll(() => {
  setupDb()
})

beforeEach(async () => {
  await truncateAll()
})

describe('GET /api/products', () => {
  it('clamps limit to upper bound 50', async () => {
    for (let i = 0; i < 51; i++) await seedProduct({ slug: `c-${i}` })
    const res = await listGET(makeJsonRequest('/api/products?limit=999'))
    const json = (await res.json()) as Array<{ id: number }>
    expect(json).toHaveLength(50)
  })

  it('Cache-Control: no-store on success', async () => {
    await seedProduct({ slug: 'one' })
    const res = await listGET(makeJsonRequest('/api/products'))
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('GET /api/products/[slug]', () => {
  it('200 on hit', async () => {
    await seedProduct({ slug: 'real-one' })
    const res = await slugGET({} as NextRequest, {
      params: Promise.resolve({ slug: 'real-one' }),
    })
    expect(res.status).toBe(200)
  })

  it('404 on miss', async () => {
    const res = await slugGET({} as NextRequest, {
      params: Promise.resolve({ slug: 'no-such-slug' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/products/categories', () => {
  it('returns ordered categories', async () => {
    await seedProduct({ slug: 'a', category: 'zebra' })
    await seedProduct({ slug: 'b', category: 'alpha' })
    const res = await catGET()
    const json = (await res.json()) as string[]
    expect(json).toEqual(['alpha', 'zebra'])
  })
})
