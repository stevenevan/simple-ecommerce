import { test, expect } from '@playwright/test'
import {
  resetDb,
  countOrders,
  getProductStock,
  getLatestOrderForUser,
  getUserIdByEmail,
} from '../fixtures/db'

test.beforeEach(async () => {
  await resetDb()
})

test('signup → browse → add to cart → checkout → order placed', async ({ page }) => {
  const stockBefore = await getProductStock(1)

  // 1. Home grid
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Test Product One/i }).first()).toBeVisible()

  // 2. Open product detail
  await page.goto('/products/p1')
  await expect(page.getByRole('button', { name: /Add to cart/i })).toBeVisible()

  // 3. Register
  await page.goto('/register')
  const email = `e2e-${Date.now()}@example.test`
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Name').fill('E2E Buyer')
  await page.getByLabel('Password').fill('Passw0rd!')
  await page.getByRole('button', { name: /Create account/i }).click()
  await page.waitForURL('**/')

  // 4. Add to cart on product page (now authenticated)
  await page.goto('/products/p1')
  await page.getByRole('button', { name: /^Add to cart$/i }).click()
  await expect(page.getByRole('button', { name: /^Add to cart$/i })).toBeEnabled()

  // 5. Go to checkout
  await page.goto('/checkout')
  await expect(page.getByRole('heading', { name: /Checkout/i })).toBeVisible()

  // 6. Fill shipping form
  await page.getByLabel('Name').fill('E2E Buyer')
  await page.getByLabel('Address').fill('1 E2E Lane')
  await page.getByLabel('City').fill('Testville')
  await page.getByLabel('Zip').fill('12345')

  // workshop: hallucinated-API guard — keep inline so the deck snippet stays copy-pastable.
  // Collect every POST URL the browser makes from now until the success-page navigation.
  // Article 02: "the diff reads plausible, the call fails silently once real traffic hits it."
  const orderPosts: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'POST') orderPosts.push(req.url())
  })

  await page.getByRole('button', { name: /Place order/i }).click()

  // 7. Lands on success page
  await page.waitForURL(/\/checkout\/success\/\d+/, { timeout: 30_000 })
  await expect(page).toHaveURL(/\/checkout\/success\/\d+/)

  // 8. Documented endpoint actually called — exact pathname, not toContain
  // (toContain('/api/orders') would also match a hallucinated /api/orders-v2).
  const apiPosts = orderPosts.filter((u) => new URL(u).pathname.startsWith('/api/'))
  expect(apiPosts).toHaveLength(1)
  expect(new URL(apiPosts[0]).pathname).toBe('/api/orders')

  // 9. Side-effects in DB — workshop rule: assert side-effects, not text.
  expect(await countOrders()).toBe(1)
  const userId = await getUserIdByEmail(email)
  const order = await getLatestOrderForUser(userId)
  expect(order.total_cents).toBe(1000)
  expect(await getProductStock(1)).toBe(stockBefore - 1)

  // 10. Cart cleared
  const cartRes = await page.request.get('/api/cart')
  const cart = await cartRes.json()
  expect(cart.items).toHaveLength(0)
})
