import { test, expect } from '@playwright/test'
import { resetDb, getUserIdByEmail, insertCartItemDirect } from '../fixtures/db'

test.beforeEach(async () => {
  await resetDb()
})

test('places order with only the selected items', async ({ page }) => {
  // 1. Register fresh user (mirrors happy-path.spec.ts auth setup)
  await page.goto('/register')
  const email = `e2e-${Date.now()}@example.test`
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Name').fill('E2E Buyer')
  await page.getByLabel('Password').fill('Passw0rd!')
  await page.getByRole('button', { name: /Create account/i }).click()
  await page.waitForURL('**/')

  // 2. Seed cart directly with two distinct products (p1 = 1000, p2 = 500)
  const userId = await getUserIdByEmail(email)
  await insertCartItemDirect(userId, 1, 1)
  await insertCartItemDirect(userId, 2, 1)

  // 3. Open the cart drawer. Reload first so useCart refetches the DB-seeded
  // rows — the query already returned empty when the user landed on '/' after
  // registration, and bypassing the UI mutation skips React Query's invalidation.
  await page.reload()
  await page.getByRole('button', { name: 'Open cart' }).click()
  // Wait for DB-seeded items to render before interacting (cart query fetches on open).
  await expect(
    page.getByRole('checkbox', { name: 'Include Test Product Two in order' }),
  ).toBeVisible()

  // 4. Uncheck p2 — keep p1 selected
  const p2Checkbox = page.getByRole('checkbox', { name: 'Include Test Product Two in order' })
  await p2Checkbox.click()
  expect(await p2Checkbox.isChecked()).toBe(false)

  // 5. Click drawer's Checkout button (it's a Button, not a Link)
  await page.getByRole('button', { name: 'Checkout' }).click()

  // 6. Fill shipping form on /checkout
  await page.getByLabel('Name').fill('E2E Buyer')
  await page.getByLabel('Address').fill('1 E2E Lane')
  await page.getByLabel('City').fill('Testville')
  await page.getByLabel('Zip').fill('12345')

  // 7. Place order, wait for success URL
  await page.getByRole('button', { name: /Place order/i }).click()
  await page.waitForURL(/\/checkout\/success\/\d+/, { timeout: 30_000 })

  // 8. Capture order id from URL
  const match = new URL(page.url()).pathname.match(/\/checkout\/success\/(\d+)/)
  expect(match).not.toBeNull()
  const orderId = Number(match![1])

  // 9. Fetch order JSON via session-cookie-carrying request context
  const res = await page.request.get(`/api/orders/${orderId}`)
  expect(res.ok()).toBe(true)
  const body = await res.json()

  // 10. Assert the order persisted only the *checked* item (p1)
  expect(body.items).toHaveLength(1)
  expect(body.items[0].product_id).toBe(1)
  expect(body.order.total_cents).toBe(1000)
})
