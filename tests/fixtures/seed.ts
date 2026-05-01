// Deterministic test seed. Fixed ids let specs reference products by id without a lookup.
// id:4 holds an overflow-priced row used only by the total_overflow test.

export const SEED_PRODUCTS = [
  {
    id: 1,
    slug: 'p1',
    name: 'Test Product One',
    description: 'd1',
    price_cents: 1000,
    image_url: '/p1.png',
    category: 'cat-a',
    stock: 5,
  },
  {
    id: 2,
    slug: 'p2',
    name: 'Test Product Two',
    description: 'd2',
    price_cents: 500,
    image_url: '/p2.png',
    category: 'cat-a',
    stock: 1,
  },
  {
    id: 3,
    slug: 'p3',
    name: 'Test Product Three',
    description: 'd3',
    price_cents: 200,
    image_url: '/p3.png',
    category: 'cat-b',
    stock: 0,
  },
  {
    id: 4,
    slug: 'p4',
    name: 'Test Product Four',
    description: 'd4',
    price_cents: Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1,
    image_url: '/p4.png',
    category: 'cat-c',
    stock: 2,
  },
] as const

export const PRODUCT_STOCK: Record<number, number> = {
  1: 5,
  2: 1,
  3: 0,
  4: 2,
}
