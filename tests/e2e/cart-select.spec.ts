import { test, expect } from '@playwright/test'
import {
  resetDb,
  countOrders,
  getProductStock,
  getUserIdByEmail,
  insertCartItemDirect,
} from '../fixtures/db'

test.beforeEach(async () => {
  await resetDb()
})

test('places order with only the selected items', async ({ page }) => {
  // 1. Register fresh user (mirrors happy-path auth setup).
  await page.goto('/register')
  const email = `e2e-cs-${Date.now()}@example.test`
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Name').fill('Selector')
  await page.getByLabel('Password').fill('Passw0rd!')
  await page.getByRole('button', { name: /Create account/i }).click()
  await page.waitForURL('**/')

  // 2. Seed two distinct cart rows directly — faster + deterministic than
  //    clicking Add-to-cart twice through the UI (per workshop CONTEXT note).
  const userId = await getUserIdByEmail(email)
  await insertCartItemDirect(userId, 1, 1)
  await insertCartItemDirect(userId, 2, 1)

  // 3. Re-navigate so the useCart query fires and the drawer's row list is
  //    populated. Without this the drawer opens with zero rows because the
  //    seed bypassed the /api/cart mutation that would have invalidated.
  await page.goto('/')

  const stock1Before = await getProductStock(1)
  const stock2Before = await getProductStock(2)

  // 4. Open drawer, deselect product 2, click Checkout.
  //    Base UI Checkbox renders as <span role="checkbox">, not a native input —
  //    Playwright's .uncheck() retry loop is flaky on it; .click() + an explicit
  //    aria-checked assertion is the documented escape hatch.
  await page.getByRole('button', { name: 'Open cart' }).click()
  const p1Checkbox = page.getByLabel('Select Test Product One')
  const p2Checkbox = page.getByLabel('Select Test Product Two')
  await expect(p1Checkbox).toHaveAttribute('aria-checked', 'true')
  await expect(p2Checkbox).toHaveAttribute('aria-checked', 'true')
  await p2Checkbox.click()
  await expect(p2Checkbox).toHaveAttribute('aria-checked', 'false')
  await expect(p1Checkbox).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Checkout' }).click()

  // 5. Fill shipping form on /checkout and place the order.
  await expect(page.getByRole('heading', { name: /Checkout/i })).toBeVisible()
  await page.getByLabel('Name').fill('Selector')
  await page.getByLabel('Address').fill('2 Pick Lane')
  await page.getByLabel('City').fill('Filterville')
  await page.getByLabel('Zip').fill('54321')
  await page.getByRole('button', { name: /Place order/i }).click()

  // 6. Capture order id from success URL.
  await page.waitForURL(/\/checkout\/success\/\d+/, { timeout: 30_000 })
  const match = page.url().match(/\/success\/(\d+)/)
  expect(match).not.toBeNull()
  const orderId = Number(match![1])

  // 7. Side-effect contract: GET /api/orders/:id returns the persisted order.
  //    The page.request context carries the session cookie automatically.
  const res = await page.request.get(`/api/orders/${orderId}`)
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as {
    order: { total_cents: number }
    items: Array<{ product_id: number }>
  }
  expect(body.items).toHaveLength(1)
  expect(body.items[0].product_id).toBe(1)
  expect(body.order.total_cents).toBe(1000)

  // 8. DB sanity — only the checked row's stock decremented.
  expect(await countOrders()).toBe(1)
  expect(await getProductStock(1)).toBe(stock1Before - 1)
  expect(await getProductStock(2)).toBe(stock2Before)
})
