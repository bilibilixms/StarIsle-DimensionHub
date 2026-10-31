import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'

const api = 'http://127.0.0.1:8787/api/demo'
const profile = 'http://127.0.0.1:4173/#/pages/index/index?tab=profile'
const merchant = 'http://127.0.0.1:4174/#/pages/index/index'
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
  return response.json()
}
async function purchase(request: APIRequestContext) {
  const paid = await command(request, 'user', {
    type: 'checkout',
    items: [{ productId: 'star-fairy', variant: 'gift', quantity: 2, expectedPrice: 15800 }],
    recipient: {
      name: '下单时的收货人',
      phone: '13800000000',
      address: '上海市 订单路 6 号（演示地址）',
    },
  })
  return paid.state.orders[0]
}
async function ship(request: APIRequestContext, id: string) {
  return command(request, 'merchant', {
    type: 'ship',
    id,
    carrier: '顺丰速运',
    tracking: 'SF202610310006',
  })
}
test.beforeEach(async ({ request }) => {
  await command(request, 'merchant', { type: 'reset' })
})

test('a completed order opens its receipt and retains the original transaction after catalog changes', async ({
  page,
  request,
}) => {
  const order = await purchase(request)
  await ship(request, order.id)
  const completed = await command(request, 'user', { type: 'receive', id: order.id })
  const completion = completed.state.orders[0].completedAt
  await command(request, 'merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '已改名的商品',
    price: '199',
    stock: '5',
  })
  await command(request, 'merchant', { type: 'toggleProduct', id: 'star-fairy' })
  await command(request, 'merchant', {
    type: 'editShop',
    name: '已改名的店铺',
    description: '新的店铺资料',
  })
  await page.goto(profile)
  await expect(page.getByTestId(`user-order-${order.id}`)).toContainText('已完成')
  await page.getByTestId('edit-recipient').click()
  await page.getByTestId('recipient-address').locator('input').fill('上海市 后来修改的新地址')
  await page.getByTestId('save-recipient').click()
  await page.getByTestId(`user-order-${order.id}`).getByText(order.title, { exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/pages/order/detail\\?id=${order.id}`))
  await expect(page.getByTestId('order-detail-status')).toHaveText('已完成')
  await expect(page.getByTestId('order-detail-title')).toHaveText(order.title)
  await expect(page.getByTestId('order-detail-shop')).toHaveText('星屿周边馆')
  await expect(page.getByTestId('order-detail-amount')).toHaveText('¥316')
  await expect(page.getByText('礼盒版 × 2', { exact: true })).toBeVisible()
  await expect(page.locator('.recipient-name')).toContainText('下单时的收货人')
  await expect(page.getByTestId('order-detail-address')).toHaveText(
    '上海市 订单路 6 号（演示地址）',
  )
  await expect(page.getByTestId('order-detail-tracking')).toHaveText('SF202610310006')
  await expect(page.getByTestId('order-detail-id')).toHaveText(order.id)
  await expect(page.getByTestId('order-detail-completed-at')).toHaveText(completion)
  for (const id of ['buy-now', 'add-to-cart', 'confirm-sku', 'order-detail-receive'])
    await expect(page.getByTestId(id)).toHaveCount(0)
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await mkdir('.tools/previews', { recursive: true })
  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => {})))
  })
  await page.screenshot({ path: '.tools/previews/order-detail-completed.png', fullPage: true })
  await page.reload()
  await expect(page.getByTestId('order-detail-status')).toHaveText('已完成')
  await expect(page.getByTestId('order-detail-amount')).toHaveText('¥316')
  await page.getByTestId('order-back').click()
  await expect(page).toHaveURL(/#\/(?:pages\/index\/index)?\?tab=profile/)
  await expect(page.getByTestId(`user-order-${order.id}`)).toContainText('已完成')
})

test('order details track shipment and allow receipt only while awaiting receipt', async ({
  page,
  context,
  request,
}) => {
  const order = await purchase(request)
  await page.goto(profile)
  await page.getByTestId(`user-order-${order.id}`).click()
  await expect(page.getByTestId('order-detail-status')).toHaveText('待发货')
  await expect(page.getByTestId('order-detail-receive')).toHaveCount(0)
  await expect(page.getByText('商家发货后会显示物流公司和单号。')).toBeVisible()
  const shop = await context.newPage()
  await shop.goto(merchant)
  await shop.getByTestId('nav-orders').click()
  await ship(request, order.id)
  await expect(page.getByTestId('order-detail-status')).toHaveText('待收货')
  await expect(page.getByTestId('order-detail-tracking')).toHaveText('SF202610310006')
  await page.getByTestId('order-detail-receive').click()
  await page.locator('uni-modal').getByText('确认收货', { exact: true }).click()
  await expect(page.getByTestId('order-detail-status')).toHaveText('已完成')
  await expect(page.getByTestId('order-detail-completed-at')).not.toHaveText('')
  await expect(page.getByTestId('order-detail-receive')).toHaveCount(0)
  await expect(shop.getByTestId(`order-${order.id}`)).toContainText('已完成')
  await page.getByTestId('order-detail-list').click()
  await expect(page.getByTestId(`user-order-${order.id}`)).toContainText('已完成')
  await shop.close()
})

test('the order product opens its current purchase page and returns to the completed receipt', async ({
  page,
  request,
}) => {
  const order = await purchase(request)
  await ship(request, order.id)
  await command(request, 'user', { type: 'receive', id: order.id })
  await command(request, 'merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '更新后的樱粉手办',
    price: '139',
    stock: '5',
  })
  await page.goto(profile)
  await page.getByTestId(`user-order-${order.id}`).click()
  await expect(page.getByTestId('order-detail-status')).toHaveText('已完成')
  await expect(page.getByTestId('order-detail-title')).toHaveText(order.title)
  await page.getByTestId('order-detail-product').click()
  await expect(page).toHaveURL(/pages\/product\/detail\?id=star-fairy/)
  await expect(page.getByTestId('detail-title')).toHaveText('更新后的樱粉手办')
  await page.getByTestId('buy-now').click()
  await expect(page.getByTestId('sku-price')).toHaveText('¥139')
  await page.getByLabel('关闭弹窗', { exact: true }).click()
  await page.getByLabel('返回', { exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/pages/order/detail\\?id=${order.id}`))
  await expect(page.getByTestId('order-detail-status')).toHaveText('已完成')
  await expect(page.getByTestId('order-detail-amount')).toHaveText('¥316')
  await expect(page.getByTestId('order-detail-title')).toHaveText(order.title)
})

test('unknown and reset orders show an empty state and return to the order list', async ({
  page,
  request,
}) => {
  await page.goto('http://127.0.0.1:4173/#/pages/order/detail?id=missing')
  await expect(page.getByTestId('order-detail-missing')).toContainText('未找到这笔订单')
  await expect(page.getByTestId('buy-now')).toHaveCount(0)
  await page.getByText('返回我的订单', { exact: true }).click()
  await expect(page).toHaveURL(/#\/(?:pages\/index\/index)?\?tab=profile/)
  const order = await purchase(request)
  await page.reload()
  await page.getByTestId(`user-order-${order.id}`).click()
  await expect(page.getByTestId('order-detail-status')).toHaveText('待发货')
  await command(request, 'merchant', { type: 'reset' })
  await expect(page.getByTestId('order-detail-missing')).toContainText('未找到这笔订单')
  await expect(page.getByTestId('order-detail-receive')).toHaveCount(0)
})
