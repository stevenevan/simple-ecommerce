import { test, expect } from '@playwright/test'
import { resetDb } from '../fixtures/db'

test.beforeEach(async () => {
  await resetDb()
})

test('signup → browse → add to cart → checkout → order placed', async ({ page }) => {
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
  // Wait until the mutation settles — button text returns to default.
  await expect(page.getByRole('button', { name: /^Add to cart$/i })).toBeEnabled()

  // 5. Go to checkout
  await page.goto('/checkout')
  await expect(page.getByRole('heading', { name: /Checkout/i })).toBeVisible()

  // 6. Fill shipping form
  await page.getByLabel('Name').fill('E2E Buyer')
  await page.getByLabel('Address').fill('1 E2E Lane')
  await page.getByLabel('City').fill('Testville')
  await page.getByLabel('Zip').fill('12345')
  await page.getByRole('button', { name: /Place order/i }).click()

  // 7. Lands on success page
  await page.waitForURL(/\/checkout\/success\/\d+/, { timeout: 30_000 })
  await expect(page).toHaveURL(/\/checkout\/success\/\d+/)

  // 8. Order shows up in orders list
  await page.goto('/orders')
  await expect(page.getByText(/\$10\.00|10\.00/)).toBeVisible()
})
