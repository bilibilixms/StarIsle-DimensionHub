import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const user = 'http://127.0.0.1:4173/#/pages/index/index'
const merchant = 'http://127.0.0.1:4174/#/pages/index/index'

test('local shopping flow preserves favorites, SKU totals and orders without API calls', async ({
  page,
}) => {
  const apiRequests: string[] = []
  const pageErrors: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiRequests.push(request.url())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(user)
  await page.getByTestId('favorite-star-fairy').click()
  await page.getByTestId('nav-profile').click()
  await expect(page.getByTestId('favorite-count')).toHaveText('1')
  await page.reload()
  await page.getByTestId('nav-profile').click()
  await expect(page.getByTestId('favorite-count')).toHaveText('1')
  await page.getByTestId('nav-home').click()
  await page.getByTestId('product-star-fairy').click()
  await expect(page.getByTestId('detail-title')).toHaveText('星之花旅人 · 樱粉手办')
  await page.getByTestId('add-to-cart').click()
  await page.getByTestId('variant-gift').click()
  await expect(page.getByTestId('sku-price')).toHaveText('¥158')
  await page.getByTestId('quantity-plus').click()
  await expect(page.getByTestId('sku-quantity')).toHaveText('2')
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('detail-cart-count')).toHaveText('2')
  await page.getByLabel('购物车', { exact: true }).click()
  await expect(page.getByTestId('cart-total')).toHaveText('¥316')
  await page.getByTestId('cart-checkout').click()
  await page.getByText('模拟支付', { exact: true }).click()
  await expect(page.getByText('实付 ¥316', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByTestId('nav-profile').click()
  await expect(page.getByText('实付 ¥316', { exact: true })).toBeVisible()
  await page.getByTestId('nav-cart').click()
  await expect(page.getByText('口袋里还没有心动好物')).toBeVisible()
  expect(apiRequests).toEqual([])
  expect(pageErrors).toEqual([])
})

test('search handles an empty result and an unknown product route', async ({ page }) => {
  await page.goto(user)
  await page.getByTestId('product-search').locator('input').fill('不存在的周边')
  await expect(page.getByText('这一份心动还没出现')).toBeVisible()
  await page.getByTestId('product-search').locator('input').fill('樱粉')
  await expect(page.getByTestId('product-star-fairy')).toBeVisible()
  await expect(page.getByTestId('product-moon-letter')).toHaveCount(0)
  await page.goto('http://127.0.0.1:4173/#/pages/product/detail?id=missing')
  await expect(page.getByText('这份好物暂时不在岛上')).toBeVisible()
})

test('buy now creates its own order and preserves the existing cart', async ({ page }) => {
  await page.goto(user)
  await page.getByTestId('product-star-fairy').click()
  await page.getByTestId('add-to-cart').click()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('detail-cart-count')).toHaveText('1')
  await page.getByTestId('buy-now').click()
  await page.getByTestId('variant-gift').click()
  await page.getByTestId('confirm-sku').click()
  await page.getByText('模拟支付', { exact: true }).click()
  await expect(page.getByText('实付 ¥158', { exact: true })).toBeVisible()
  await page.getByTestId('nav-cart').click()
  await expect(page.getByTestId('cart-total')).toHaveText('¥128')
})

test('merchant shipment validates tracking and persists the new order status', async ({ page }) => {
  await page.goto(merchant)
  await page.getByTestId('waiting-orders').click()
  await expect(page.getByTestId('order-XY20261029008')).toBeVisible()
  await page.getByTestId('ship-XY20261029008').click()
  await page.getByTestId('confirm-ship').click()
  await expect(page.getByTestId('ship-error')).toContainText('8–24')
  await page.getByTestId('ship-tracking').locator('input').fill('SF1234567890')
  await page.getByTestId('confirm-ship').click()
  await expect(page.getByTestId('order-XY20261029008')).toHaveCount(0)
  await page.getByTestId('status-待收货').click()
  await expect(page.getByTestId('order-XY20261029008')).toContainText('待收货')
  await page.reload()
  await page.getByTestId('nav-orders').click()
  await page.getByTestId('status-待收货').click()
  await expect(page.getByTestId('order-XY20261029008')).toContainText('待收货')
  await page.getByTestId('order-XY20261029008').getByText('查看详情').click()
  await expect(page.getByText('SF1234567890', { exact: true })).toBeVisible()
})

test('merchant edits and publication status survive reload', async ({ page }) => {
  await page.goto(merchant)
  await page.getByTestId('nav-products').click()
  await page.getByTestId('edit-star-fairy').click()
  await page.getByTestId('edit-product-price').locator('input').fill('139.50')
  await page.getByTestId('edit-product-stock').locator('input').fill('8')
  await page.getByTestId('save-product').click()
  await expect(page.getByTestId('managed-star-fairy')).toContainText('¥139.50')
  await expect(page.getByTestId('managed-star-fairy')).toContainText('库存 8')
  await page.getByTestId('toggle-star-fairy').click()
  await expect(page.getByTestId('managed-star-fairy')).toContainText('已下架')
  await page.reload()
  await page.getByTestId('nav-products').click()
  await expect(page.getByTestId('managed-star-fairy')).toContainText('已下架')
  await expect(page.getByTestId('managed-star-fairy')).toContainText('¥139.50')
})

test('three samples fit mobile widths and save preview screenshots', async ({ page }) => {
  await mkdir('.tools/previews', { recursive: true })
  const samples = [
    { name: 'user-home', url: user, ready: 'home-hero' },
    {
      name: 'product-detail',
      url: 'http://127.0.0.1:4173/#/pages/product/detail?id=star-fairy',
      ready: 'detail-title',
    },
    { name: 'merchant-workspace', url: merchant, ready: 'waiting-orders' },
  ]
  const assetErrors: string[] = []
  page.on('response', (response) => {
    if (response.status() >= 400 && /\.(svg|jpg|js|css)/.test(response.url()))
      assetErrors.push(response.url())
  })
  for (const sample of samples) {
    await page.goto(sample.url)
    await expect(page.getByTestId(sample.ready)).toBeVisible()
    for (const width of [375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => {})))
    })
    await page.screenshot({ path: `.tools/previews/${sample.name}.png` })
    await page.screenshot({ path: `.tools/previews/${sample.name}-full.png`, fullPage: true })
  }
  expect(assetErrors).toEqual([])
})
