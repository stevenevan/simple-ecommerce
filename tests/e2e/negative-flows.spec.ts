// Negative E2E flows: failed login, empty cart checkout redirect,
// and form validation errors visible in the UI.

import { test, expect } from '@playwright/test'
import { resetDb } from '../fixtures/db'

test.beforeEach(async () => {
  await resetDb()
})

test.describe('login failures', () => {
  test('wrong credentials shows error toast', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('nonexistent@example.com')
    await page.getByLabel('Password').fill('WrongPass1!')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    // Toast with error message should appear (sonner renders in [data-sonner-toast])
    const toast = page.locator('[data-sonner-toast]')
    await expect(toast).toBeVisible({ timeout: 5000 })
    // Error surfaces as "HTTP 401" via parseAuthError fallback
    await expect(toast).toContainText(/HTTP 401|invalid_credentials/i)

    // Should stay on login page (no redirect)
    await expect(page).toHaveURL(/\/login/)
  })

  test('short password shows client validation error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('short')
    await page.getByLabel('Password').blur()

    // Client-side validation error should appear (min 8 chars)
    await expect(page.getByText(/8/)).toBeVisible({ timeout: 3000 })
  })
})

test.describe('checkout guards', () => {
  test('unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/checkout')
    await page.waitForURL(/\/login/, { timeout: 5000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('authenticated user with empty cart sees empty message', async ({ page }) => {
    // Register first
    await page.goto('/register')
    const email = `e2e-empty-${Date.now()}@example.test`
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Name').fill('Empty Cart User')
    await page.getByLabel('Password').fill('Passw0rd!')
    await page.getByRole('button', { name: /Create account/i }).click()
    await page.waitForURL('**/')

    // Go to checkout with empty cart
    await page.goto('/checkout')
    await expect(page.getByText(/Your cart is empty/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('link', { name: /Browse products/i })).toBeVisible()
  })
})

test.describe('checkout form validation', () => {
  test('missing zip shows validation error', async ({ page }) => {
    // Register and add item to cart
    await page.goto('/register')
    const email = `e2e-val-${Date.now()}@example.test`
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Name').fill('Validation User')
    await page.getByLabel('Password').fill('Passw0rd!')
    await page.getByRole('button', { name: /Create account/i }).click()
    await page.waitForURL('**/')

    // Add product to cart
    await page.goto('/products/p1')
    await page.getByRole('button', { name: /^Add to cart$/i }).click()
    await expect(page.getByRole('button', { name: /^Add to cart$/i })).toBeEnabled()

    // Go to checkout, fill partial form
    await page.goto('/checkout')
    await expect(page.getByRole('heading', { name: /Checkout/i })).toBeVisible()

    await page.getByLabel('Name').fill('Test Buyer')
    await page.getByLabel('Address').fill('123 Main St')
    await page.getByLabel('City').fill('Testville')
    // Leave zip empty, blur to trigger validation
    await page.getByLabel('Zip').focus()
    await page.getByLabel('Zip').blur()

    // Place order button should be disabled due to validation
    await expect(page.getByRole('button', { name: /Place order/i })).toBeDisabled()
  })
})
