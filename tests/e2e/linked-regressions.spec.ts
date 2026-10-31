import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const api = 'http://127.0.0.1:8787/api/demo'
const user = 'http://127.0.0.1:4173/#/pages/index/index'
const detail = 'http://127.0.0.1:4173/#/pages/product/detail?id=star-fairy'
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
async function snapshot(request: APIRequestContext) {
  return (await (await request.get(`${api}/state`, { headers: { 'X-Demo-Role': 'user' } })).json())
    .state
}
async function stock(request: APIRequestContext, quantity: number) {
  return command(request, 'merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '星之花旅人 · 樱粉手办',
    price: '128',
    stock: String(quantity),
  })
}
async function purchase(request: APIRequestContext) {
  return command(request, 'user', {
    type: 'checkout',
    items: [{ productId: 'star-fairy', variant: 'standard', quantity: 1, expectedPrice: 12800 }],
    recipient: { name: '功能测试用户', phone: '13800000000', address: '上海市 演示路 1 号' },
  })
}
async function edit(page: Page) {
  await page.goto(merchant)
  await page.getByTestId('nav-products').click()
  await page.getByTestId('edit-star-fairy').click()
}
test.beforeEach(async ({ request }) => {
  await command(request, 'merchant', { type: 'reset' })
})

test('editing only price never restores inventory sold while the merchant form was open', async ({
  page,
  request,
}) => {
  await stock(request, 2)
  await edit(page)
  await expect(page.getByTestId('edit-product-stock').locator('input')).toHaveValue('2')
  await purchase(request)
  await page.getByTestId('edit-product-price').locator('input').fill('139')
  await page.getByTestId('save-product').click()
  await expect(page.getByTestId('managed-star-fairy')).toContainText('¥139')
  const saved = await snapshot(request)
  expect(saved.products[0].stock).toBe(1)
  expect(saved.orders).toHaveLength(1)
  expect(saved.orders[0].amount).toBe(12800)
})

test('an explicit stale stock edit is rejected and reopening the form allows a confirmed restock', async ({
  page,
  request,
}) => {
  await stock(request, 2)
  await edit(page)
  await page.getByTestId('edit-product-stock').locator('input').fill('5')
  await page.getByTestId('edit-product-price').locator('input').fill('139')
  await purchase(request)
  await page.getByTestId('save-product').click()
  await expect(
    page.getByText('库存已变化，请重新打开商品编辑后确认库存', { exact: true }),
  ).toBeVisible()
  const conflict = await snapshot(request)
  expect(conflict.products[0].stock).toBe(1)
  expect(conflict.products[0].price).toBe(12800)
  await page.getByLabel('关闭弹窗', { exact: true }).click()
  await page.getByTestId('edit-star-fairy').click()
  await expect(page.getByTestId('edit-product-stock').locator('input')).toHaveValue('1')
  await page.getByTestId('edit-product-stock').locator('input').fill('5')
  await page.getByTestId('save-product').click()
  await expect(page.getByTestId('managed-star-fairy')).toContainText('库存 5')
  expect((await snapshot(request)).products[0].stock).toBe(5)
})

test('a reset removes missing cart items and allows a new product to be paid for', async ({
  page,
  request,
}) => {
  const created = await command(request, 'merchant', {
    type: 'createProduct',
    title: '重置前的挂件',
    price: '19',
    stock: '2',
    cover: '/static/demo/star-fairy.jpg',
  })
  const removedId = created.state.products[0].id
  await page.goto(`http://127.0.0.1:4173/#/pages/product/detail?id=${removedId}`)
  await page.getByTestId('add-to-cart').click()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('detail-cart-count')).toHaveText('1')
  await command(request, 'merchant', { type: 'reset' })
  await page.goto(user)
  await page.getByTestId('product-star-fairy').click()
  await page.getByTestId('add-to-cart').click()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('detail-cart-count')).toHaveText('1')
  await page.getByLabel('购物车', { exact: true }).click()
  await expect(page.locator('.cart-item')).toHaveCount(1)
  await expect(page.getByTestId(`cart-item-${removedId}`)).toHaveCount(0)
  await expect(page.getByTestId('cart-checkout')).not.toHaveAttribute('disabled', 'true')
  await page.getByTestId('cart-checkout').click()
  await expect(page.locator('uni-modal')).toContainText('¥128')
  await page.getByText('模拟支付', { exact: true }).click()
  await expect(page.getByText('实付 ¥128', { exact: true })).toBeVisible()
  expect((await snapshot(request)).orders).toHaveLength(1)
})

test('an unpublished cart product remains removable and cannot be purchased', async ({
  page,
  request,
}) => {
  await page.goto(detail)
  await page.getByTestId('add-to-cart').click()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('detail-cart-count')).toHaveText('1')
  await page.getByLabel('购物车', { exact: true }).click()
  await command(request, 'merchant', { type: 'toggleProduct', id: 'star-fairy' })
  await expect(page.getByTestId('cart-stock')).toHaveText('商品已下架')
  await expect(page.getByTestId('cart-checkout')).toHaveAttribute('disabled', 'true')
  await page.getByLabel('移除商品', { exact: true }).click()
  await expect(page.getByText('口袋里还没有心动好物')).toBeVisible()
  expect((await snapshot(request)).orders).toHaveLength(0)
})

for (const committed of [true, false]) {
  test(`an unpublished product resolves a lost payment (${committed ? 'committed' : 'not committed'}) after reload`, async ({
    page,
    request,
  }) => {
    await stock(request, 1)
    await page.goto(detail)
    await page.getByTestId('buy-now').click()
    let lose = true
    await page.route('**/api/demo/commands', async (route) => {
      if (route.request().method() === 'POST' && lose) {
        lose = false
        if (committed) expect((await route.fetch()).ok()).toBe(true)
        await route.abort('failed')
      } else await route.continue()
    })
    await page.getByTestId('confirm-sku').click()
    await page.getByText('模拟支付', { exact: true }).click()
    await expect(
      page.getByText('暂时无法连接演示服务，请检查服务后重试', { exact: true }),
    ).toBeVisible()
    const initial = await snapshot(request)
    expect(initial.orders).toHaveLength(committed ? 1 : 0)
    await command(request, 'merchant', { type: 'toggleProduct', id: 'star-fairy' })
    await page.reload()
    await expect(page.getByText('这份好物暂时不在岛上')).toBeVisible()
    await expect(page.getByTestId('buy-now')).toHaveText('确认支付结果')
    await expect(page.getByTestId('add-to-cart')).toHaveCount(0)
    await page.getByTestId('buy-now').click()
    await expect(page.locator('uni-modal')).toContainText('¥128')
    await page.getByText('模拟支付', { exact: true }).click()
    if (committed)
      await expect(page.getByTestId(`user-order-${initial.orders[0].id}`)).toBeVisible()
    else {
      await expect(page.getByText('商品已下架，请刷新后重新选择', { exact: true })).toBeVisible()
      await expect(page.getByTestId('buy-now')).toHaveCount(0)
      await page.reload()
      await expect(page.getByTestId('buy-now')).toHaveCount(0)
    }
    const saved = await snapshot(request)
    expect(saved.orders.map((order: { id: string }) => order.id)).toEqual(
      initial.orders.map((order: { id: string }) => order.id),
    )
    expect(saved.products[0].stock).toBe(committed ? 0 : 1)
  })
}

test('an unpublished product has a back button returning to the same completed order', async ({
  page,
  request,
}) => {
  const paid = await purchase(request)
  const orderId = paid.orderIds[0]
  await command(request, 'merchant', {
    type: 'ship',
    id: orderId,
    carrier: '顺丰速运',
    tracking: 'SF202610310001',
  })
  await command(request, 'user', { type: 'receive', id: orderId })
  await command(request, 'merchant', { type: 'toggleProduct', id: 'star-fairy' })
  await page.goto(`${user}?tab=profile`)
  await page.getByTestId(`user-order-${orderId}`).click()
  await page.getByTestId('order-detail-product').click()
  await expect(page.getByText('这份好物暂时不在岛上')).toBeVisible()
  await page.getByLabel('返回', { exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/pages/order/detail\\?id=${orderId}`))
  await expect(page.getByTestId('order-detail-status')).toHaveText('已完成')
  await expect(page.getByTestId('order-detail-amount')).toHaveText('¥128')
})

test('cancelling payment leaves orders and inventory unchanged and allows retry', async ({
  page,
  request,
}) => {
  await page.goto(detail)
  await page.getByTestId('buy-now').click()
  await page.getByTestId('confirm-sku').click()
  await page
    .locator('uni-modal')
    .getByText(/^(取消|Cancel)$/)
    .click()
  await expect(page.locator('uni-modal')).not.toBeVisible()
  await expect(page.getByTestId('confirm-sku')).not.toHaveAttribute('disabled', 'true')
  const saved = await snapshot(request)
  expect(saved.orders).toHaveLength(0)
  expect(saved.products[0].stock).toBe(36)
})

test('an invalid recipient phone is blocked and the corrected phone persists', async ({ page }) => {
  await page.goto(`${user}?tab=profile`)
  await page.getByTestId('edit-recipient').click()
  await page.getByTestId('recipient-phone').locator('input').fill('123')
  await page.getByTestId('save-recipient').click()
  await expect(page.getByText('请填写 11 位演示手机号', { exact: true })).toBeVisible()
  await page.getByTestId('recipient-phone').locator('input').fill('13800000001')
  await page.getByTestId('save-recipient').click()
  await page.reload()
  await page.getByTestId('nav-profile').click()
  await expect(page.getByTestId('edit-recipient')).toContainText('13800000001')
})
