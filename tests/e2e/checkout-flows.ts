import { expect, type Page } from '@playwright/test'

export async function ensureCheckoutAddress(page: Page) {
  await expect(page.getByTestId('checkout-page')).toBeVisible()
  if (await page.getByTestId('checkout-address-text').count()) return
  await page.getByTestId('checkout-address').click()
  await page.getByTestId('recipient-name').locator('input').fill('演示收货人')
  await page.getByTestId('recipient-phone').locator('input').fill('13800000001')
  await page.getByTestId('recipient-address').locator('input').fill('上海市 测试路 8 号')
  await page.getByTestId('save-recipient').click()
  await expect(page.getByTestId('checkout-address-text')).toContainText('测试路 8 号')
}
export async function viewPaidOrders(page: Page) {
  await expect(
    page.getByTestId('order-detail-status').or(page.getByTestId('checkout-result')),
  ).toBeVisible()
  if (await page.getByTestId('order-detail-status').count())
    await page.getByTestId('order-detail-list').click()
  else await page.getByTestId('checkout-result-orders').click()
  await expect(page.getByTestId('nav-profile')).toBeVisible()
}
export async function pay(page: Page, success = true) {
  await ensureCheckoutAddress(page)
  await page.getByTestId('confirm-payment').click()
  if (success) await viewPaidOrders(page)
}
