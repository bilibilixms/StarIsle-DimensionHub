import { test, expect } from './fixtures'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'
import type { APIRequestContext } from '@playwright/test'
const api = 'http://127.0.0.1:8787/api/demo'
async function command(
  request: APIRequestContext,
  role: 'user' | 'merchant',
  data: Record<string, unknown>,
) {
  const response = await request.post(`${api}/commands`, {
    headers: { 'X-Demo-Role': role, 'X-Idempotency-Key': randomUUID() },
    data,
  })
  expect(response.ok()).toBe(true)
  return (await response.json()).state
}
test.beforeEach(async ({ request }) => {
  await command(request, 'merchant', { type: 'reset' })
})
async function purchase(request: APIRequestContext) {
  const state = await command(request, 'user', {
    type: 'checkout',
    items: [{ productId: 'star-fairy', variant: 'standard', quantity: 1, expectedPrice: 12800 }],
    recipient: { name: '评价买家', phone: '13800000000', address: '上海市 评价路 8 号' },
  })
  return state.orders[0]
}

test('buyer posts an image review and merchant reply appears in product and order details', async ({
  page,
  context,
  request,
}) => {
  const order = await purchase(request)
  await command(request, 'merchant', {
    type: 'ship',
    id: order.id,
    carrier: '顺丰',
    tracking: 'SF202611130001',
  })
  await command(request, 'user', { type: 'receive', id: order.id })
  await page.goto(`http://127.0.0.1:4173/#/pages/order/detail?id=${order.id}`)
  await page.getByTestId('review-open-0').click()
  await page.getByTestId('review-rating-3').click()
  await page
    .getByTestId('review-content')
    .locator('textarea')
    .fill('实物颜色漂亮，底座还可以再稳一些。')
  const png = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#baa2dd' } })
    .png()
    .toBuffer()
  const picker = page.waitForEvent('filechooser')
  await page.getByTestId('upload-review-image').click()
  await (await picker).setFiles({ name: 'review.png', mimeType: 'image/png', buffer: png })
  await expect(page.locator('.review-photos img')).toHaveCount(1)
  await page.getByTestId('submit-review').click()
  await expect(page.getByTestId('submit-review')).toHaveCount(0)
  const data = (await (await request.get(`${api}/state`)).json()).state
  const review = data.reviews.find((item: { orderId: string }) => item.orderId === order.id)
  expect(review.rating).toBe(3)
  await expect(page.getByTestId(`review-${review.id}`)).toContainText('实物颜色漂亮')
  const seller = await context.newPage()
  await seller.goto('http://127.0.0.1:4174/#/pages/merchant/index')
  await seller.getByTestId('manage-reviews').click()
  await expect(seller.getByTestId('merchant-reviews')).toContainText('1 条待回复')
  await seller
    .getByTestId(`reply-content-${review.id}`)
    .locator('textarea')
    .fill('感谢建议，我们会改进底座的稳固度。')
  await seller.getByTestId(`reply-submit-${review.id}`).click()
  await expect(seller.getByTestId(`reply-submit-${review.id}`)).toHaveCount(0)
  await expect(page.getByTestId(`review-${review.id}`)).toContainText('改进底座')
  await page.reload()
  await expect(page.getByTestId('review-open-0')).toHaveCount(0)
  await expect(page.getByTestId(`review-${review.id}`)).toContainText('改进底座')
  await page.goto('http://127.0.0.1:4173/#/pages/product/detail?id=star-fairy')
  await expect(page.getByTestId('product-reviews')).toContainText('买家评价（1）')
  await expect(page.getByTestId('review-average')).toHaveText('3.0 分 / 5')
  await expect(page.getByTestId(`review-${review.id}`)).toContainText('改进底座')
  await expect(page.getByTestId(`review-${review.id}`).locator('img')).toHaveCount(1)
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await mkdir('.tools/previews', { recursive: true })
  await page.getByTestId('product-reviews').scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.tools/previews/product-reviews.png' })
  await seller.close()
})

test('review form is unavailable until receipt and rejects an empty comment', async ({
  page,
  request,
}) => {
  const order = await purchase(request)
  await page.goto(`http://127.0.0.1:4173/#/pages/order/detail?id=${order.id}`)
  await expect(page.getByTestId('order-detail-status')).toHaveText('待发货')
  await expect(page.getByTestId('review-open-0')).toHaveCount(0)
  await command(request, 'merchant', {
    type: 'ship',
    id: order.id,
    carrier: '顺丰',
    tracking: 'SF202611130002',
  })
  await expect(page.getByTestId('order-detail-status')).toHaveText('待收货')
  await expect(page.getByTestId('review-open-0')).toHaveCount(0)
  await command(request, 'user', { type: 'receive', id: order.id })
  await page.getByTestId('review-open-0').click()
  await expect(page.getByTestId('submit-review')).toHaveAttribute('disabled', 'true')
})

test('order card shortcuts open review and after-sales sections and show updated states', async ({
  page,
  request,
}) => {
  const order = await purchase(request)
  await command(request, 'merchant', {
    type: 'ship',
    id: order.id,
    carrier: '顺丰',
    tracking: 'SF202611130003',
  })
  await command(request, 'user', { type: 'receive', id: order.id })
  await page.goto('http://127.0.0.1:4173/#/pages/index/index?tab=profile')
  const card = page.getByTestId(`user-order-${order.id}`)
  await expect(card.getByTestId(`review-order-${order.id}`)).toHaveText('去评价')
  await expect(card.getByTestId(`aftersale-${order.id}`)).toHaveText('申请售后')
  await page.getByTestId(`review-order-${order.id}`).click()
  await expect(page).toHaveURL(/action=review/)
  await expect(page.getByTestId('review-content')).toBeInViewport()
  await page.getByTestId('review-content').locator('textarea').fill('从订单卡片直接评价，很方便。')
  await page.getByTestId('submit-review').click()
  await expect(page.getByTestId('submit-review')).toHaveCount(0)
  await page.getByTestId('order-detail-list').click()
  await expect(page.getByTestId(`review-order-${order.id}`)).toHaveText('查看评价')
  await page.getByTestId(`aftersale-${order.id}`).click()
  await expect(page).toHaveURL(/action=aftersale/)
  await expect(page.getByTestId('request-refund')).toBeInViewport()
  await page.getByTestId('refund-reason').locator('textarea').fill('申请售后协商')
  await page.getByTestId('request-refund').click()
  await expect(page.getByTestId('order-detail-status')).toHaveText('退款中')
  await page.getByTestId('order-detail-list').click()
  await expect(page.getByTestId(`aftersale-${order.id}`)).toHaveText('售后进度')
  await expect(page.getByTestId(`review-order-${order.id}`)).toHaveText('查看评价')
  await page.getByTestId(`user-order-${order.id}`).scrollIntoViewIfNeeded()
  await mkdir('.tools/previews', { recursive: true })
  await page.screenshot({ path: '.tools/previews/order-card-actions.png' })
})
