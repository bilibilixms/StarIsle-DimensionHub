import { test, expect } from './fixtures'
import type { Page, APIRequestContext } from '@playwright/test'
import { randomInt, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { viewPaidOrders } from './checkout-flows'
const root = 'http://127.0.0.1:4173/#/'
const api = 'http://127.0.0.1:8787/api/demo'
let shops: { token: string; account: { shopId: string } }[] = []
async function command(request: APIRequestContext, data: Record<string, unknown>, token?: string) {
  const response = await request.post(`${api}/commands`, {
    headers: {
      'X-Demo-Role': 'merchant',
      'X-Idempotency-Key': randomUUID(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    data,
  })
  expect(response.ok()).toBe(true)
  return response.json()
}
async function state(request: APIRequestContext) {
  return (await (await request.get(`${api}/state`, { headers: { 'X-Demo-Role': 'user' } })).json())
    .state
}
async function shop(request: APIRequestContext) {
  const response = await request.post(`${api}/auth/register`, {
    data: {
      role: 'merchant',
      phone: `1${randomInt(1e9, 1e10)}`,
      password: '123456',
      shopName: `确认订单小店${randomUUID().slice(0, 5)}`,
      qualificationCode: '1234',
    },
  })
  expect(response.ok()).toBe(true)
  const session = (await response.json()).session
  shops.push(session)
  const created = await command(
    request,
    {
      type: 'createProduct',
      title: '跨店挂件',
      price: '29',
      stock: '2',
      cover: '/static/demo/star-fairy.jpg',
    },
    session.token,
  )
  return { ...session, productId: created.state.products[0].id }
}
async function add(page: Page, id: string, variant = 'standard', quantity = 1) {
  await page.goto(root)
  await page.getByTestId(`product-${id}`).click()
  await page.getByTestId('add-to-cart').click()
  if (variant === 'gift') await page.getByTestId('variant-gift').click()
  for (let i = 1; i < quantity; i++) await page.getByTestId('quantity-plus').click()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('detail-cart-count')).toBeVisible()
}
async function checkoutCart(page: Page) {
  await page.getByLabel('购物车', { exact: true }).click()
  await page.getByTestId('cart-checkout').click()
  await expect(page.getByTestId('checkout-page')).toBeVisible()
}
async function fillAddress(page: Page, name: string, address: string, phone = '13800000001') {
  await page.getByTestId('recipient-name').locator('input').fill(name)
  await page.getByTestId('recipient-phone').locator('input').fill(phone)
  await page.getByTestId('recipient-address').locator('input').fill(address)
}
async function buy(page: Page) {
  await page.goto(root)
  await page.getByTestId('product-star-fairy').click()
  await page.getByTestId('buy-now').click()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('checkout-page')).toBeVisible()
}
test.beforeEach(async ({ request }) => {
  shops = []
  await command(request, { type: 'reset' })
})
test.afterEach(async ({ request }) => {
  for (const session of shops) await command(request, { type: 'reset' }, session.token)
})

test('same-shop products and variants form one order whose full item list reaches both sides', async ({
  page,
  request,
  context,
}) => {
  await add(page, 'star-fairy')
  await add(page, 'star-fairy', 'gift')
  await add(page, 'island-card', 'standard', 2)
  await checkoutCart(page)
  await expect(page.locator('.checkout-shop')).toHaveCount(1)
  await expect(page.locator('.checkout-item')).toHaveCount(3)
  await expect(page.getByTestId('checkout-total')).toHaveText('¥322')
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await mkdir('.tools/previews', { recursive: true })
  await expect(page.locator('uni-toast')).toBeHidden()
  await page.screenshot({ path: '.tools/previews/checkout-confirmation.png', fullPage: true })
  await page.getByTestId('confirm-payment').click()
  await expect(page.getByTestId('order-detail-status')).toHaveText('待发货')
  await expect(page.getByTestId('order-items-count')).toHaveText('共 3 款商品，4 件')
  await expect(page.getByTestId('order-detail-amount')).toHaveText('¥322')
  const saved = await state(request)
  expect(saved.orders).toHaveLength(1)
  const order = saved.orders[0]
  expect(order.items.map((item: { quantity: number }) => item.quantity)).toEqual([1, 1, 2])
  const merchant = await context.newPage()
  await merchant.goto('http://127.0.0.1:4174/#/')
  await merchant.getByTestId('nav-orders').click()
  await expect(merchant.getByTestId(`order-${order.id}`).locator('.order-item')).toHaveCount(3)
  await merchant.getByTestId(`ship-${order.id}`).click()
  await expect(merchant.getByRole('dialog')).toContainText('云上星屿')
  await merchant.getByTestId('ship-tracking').locator('input').fill('SF202610310008')
  await merchant.getByTestId('confirm-ship').click()
  await expect(page.getByTestId('order-detail-status')).toHaveText('待收货')
  await page.getByTestId('order-detail-receive').click()
  await page.locator('uni-modal').getByText('确认收货', { exact: true }).click()
  await expect(page.getByTestId('order-detail-status')).toHaveText('已完成')
  await expect(page.locator('.order-item')).toHaveCount(3)
  await merchant.close()
})

test('cross-shop payment displays separate orders and reload cannot submit them twice', async ({
  page,
  request,
}) => {
  const merchant = await shop(request)
  await add(page, 'star-fairy')
  await add(page, merchant.productId)
  await checkoutCart(page)
  await expect(page.locator('.checkout-shop')).toHaveCount(2)
  await expect(page.getByTestId('checkout-total')).toHaveText('¥157')
  await expect(page.getByText('本次下单将按店铺拆成 2 笔订单，分别发货。')).toBeVisible()
  await page.getByTestId('confirm-payment').click()
  await expect(page.getByTestId('checkout-result')).toContainText('已按店铺生成 2 笔订单')
  await expect(page.locator('uni-toast')).toBeHidden()
  await page.screenshot({ path: '.tools/previews/checkout-split-result.png', fullPage: true })
  const saved = await state(request)
  expect(saved.orders).toHaveLength(2)
  expect(
    saved.orders
      .map((order: { amount: number }) => order.amount)
      .sort((a: number, b: number) => a - b),
  ).toEqual([2900, 12800])
  await page.reload()
  await expect(page.getByTestId('checkout-result')).toBeVisible()
  await expect(page.getByTestId('confirm-payment')).toHaveCount(0)
  expect((await state(request)).orders).toHaveLength(2)
  const owned = saved.orders.find(
    (order: { shopId: string }) => order.shopId === merchant.account.shopId,
  )
  await page.getByTestId(`checkout-order-${owned.id}`).click()
  await expect(page.getByTestId('order-detail-title')).toHaveText('跨店挂件')
  await command(
    request,
    { type: 'ship', id: owned.id, carrier: '顺丰', tracking: 'SF202610310009' },
    merchant.token,
  )
  await expect(page.getByTestId('order-detail-status')).toHaveText('待收货')
  expect(
    (await state(request)).orders.find((order: { id: string }) => order.id !== owned.id).status,
  ).toBe('待发货')
})

test('a new customer adds and selects addresses before paying without altering the default or paid snapshot', async ({
  browser,
}) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.goto(root)
    await page.getByTestId('auth-register').click()
    await page
      .getByTestId('auth-phone')
      .locator('input')
      .fill(`1${randomInt(1e9, 1e10)}`)
    await page.getByTestId('auth-password').locator('input').fill('123456')
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('home-hero')).toBeVisible()
    await buy(page)
    await expect(page.getByTestId('confirm-payment')).toHaveAttribute('disabled', 'true')
    await expect(page.getByTestId('checkout-address-text')).toHaveCount(0)
    await page.getByTestId('checkout-address').click()
    await fillAddress(page, '第一位收货人', '上海市 第一条地址 1 号')
    await page.getByTestId('save-recipient').click()
    await expect(page.getByTestId('checkout-address-text')).toHaveText('上海市 第一条地址 1 号')
    await page.getByTestId('checkout-address').click()
    await page.getByTestId('add-address').click()
    await fillAddress(page, '第二位收货人', '上海市 第二条地址 2 号')
    await page.getByTestId('save-recipient').click()
    await expect(page.getByTestId('checkout-address-text')).toHaveText('上海市 第二条地址 2 号')
    await page.getByTestId('confirm-payment').click()
    await expect(page.getByTestId('order-detail-address')).toHaveText('上海市 第二条地址 2 号')
    const orderUrl = page.url()
    await viewPaidOrders(page)
    await page.getByTestId('manage-addresses').click()
    await expect(page.getByTestId('default-address').locator('..')).toContainText('第一位收货人')
    const second = page.locator('.address-card').filter({ hasText: '第二位收货人' })
    await second.getByTestId('edit-address').click()
    await fillAddress(page, '后来修改的收货人', '上海市 后来修改的地址 3 号')
    await page.getByTestId('save-recipient').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.goto(orderUrl)
    await expect(page.getByTestId('order-detail-address')).toHaveText('上海市 第二条地址 2 号')
  } finally {
    await page.close()
  }
})

test('address management validates, edits, changes the default, persists and deletes addresses', async ({
  page,
}) => {
  await page.goto(`${root}pages/index/index?tab=profile`)
  await page.getByTestId('manage-addresses').click()
  await page.getByTestId('add-address').click()
  await fillAddress(page, '新增收货人', '上海市 新增地址 8 号', '123')
  await page.getByTestId('save-recipient').click()
  await expect(page.getByTestId('address-error')).toContainText('11 位')
  await page.getByTestId('recipient-phone').locator('input').fill('13800000008')
  await page.getByTestId('address-default-toggle').click()
  await page.getByTestId('save-recipient').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.address-card')).toHaveCount(2)
  const added = page.locator('.address-card').filter({ hasText: '新增收货人' })
  await expect(added.getByTestId('default-address')).toBeVisible()
  await page.screenshot({ path: '.tools/previews/address-book.png', fullPage: true })
  await page.reload()
  await expect(added.getByTestId('default-address')).toBeVisible()
  await added.getByTestId('edit-address').click()
  await page.getByTestId('recipient-address').locator('input').fill('上海市 编辑后的地址 9 号')
  await page.getByTestId('save-recipient').click()
  await expect(added).toContainText('编辑后的地址 9 号')
  await added.getByTestId('delete-address').click()
  await page.locator('uni-modal').getByText('删除', { exact: true }).click()
  await expect(page.locator('.address-card')).toHaveCount(1)
  await expect(page.getByTestId('default-address')).toBeVisible()
  await page.getByTestId('address-back').click()
  await expect(page.getByTestId('edit-recipient')).toContainText('小星同学')
})

test('price changes require explicit confirmation and a final server race cannot pay an old amount', async ({
  page,
  request,
}) => {
  await buy(page)
  await command(request, {
    type: 'editProduct',
    id: 'star-fairy',
    title: '星之花旅人 · 樱粉手办',
    price: '139',
  })
  await expect(page.getByTestId('checkout-error')).toContainText('商品价格已变化')
  await expect(page.getByTestId('checkout-total')).toHaveText('¥128')
  await page.getByTestId('checkout-refresh').click()
  await expect(page.getByTestId('checkout-total')).toHaveText('¥139')
  let changed = false
  await page.route('**/api/demo/commands', async (route) => {
    if (!changed && route.request().postDataJSON().type === 'checkout') {
      changed = true
      await command(request, {
        type: 'editProduct',
        id: 'star-fairy',
        title: '星之花旅人 · 樱粉手办',
        price: '149',
      })
    }
    await route.continue()
  })
  await page.getByTestId('confirm-payment').click()
  await expect(page.getByTestId('checkout-error')).toContainText('商品价格已变化')
  expect((await state(request)).orders).toHaveLength(0)
  await page.getByTestId('checkout-refresh').click()
  await expect(page.getByTestId('checkout-total')).toHaveText('¥149')
  await page.getByTestId('confirm-payment').click()
  await expect(page.getByTestId('order-detail-amount')).toHaveText('¥149')
  expect((await state(request)).orders).toHaveLength(1)
})

test('a lost grouped payment locks its recipient and survives address edits and reload without duplication', async ({
  page,
  context,
  request,
}) => {
  await add(page, 'star-fairy')
  await add(page, 'island-card')
  await checkoutCart(page)
  const originalAddress = await page.getByTestId('checkout-address-text').textContent()
  let lost = false
  await page.route('**/api/demo/commands', async (route) => {
    if (!lost) {
      lost = true
      expect((await route.fetch()).ok()).toBe(true)
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByTestId('confirm-payment').click()
  await expect(page.getByTestId('checkout-pending')).toBeVisible()
  await expect(page.getByTestId('checkout-address')).toHaveAttribute('disabled', 'true')
  const original = (await state(request)).orders[0]
  const profile = await context.newPage()
  await profile.goto(`${root}pages/index/index?tab=profile`)
  await profile.getByTestId('edit-recipient').click()
  await profile.getByTestId('recipient-address').locator('input').fill('上海市 之后修改的地址')
  await profile.getByTestId('save-recipient').click()
  await expect(profile.getByTestId('save-recipient')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('checkout-address-text')).toHaveText(originalAddress!)
  await page.getByTestId('confirm-payment').click()
  await expect(page.getByTestId('order-detail-id')).toHaveText(original.id)
  await expect(page.getByTestId('order-detail-address')).toHaveText(original.recipient.address)
  expect((await state(request)).orders).toHaveLength(1)
  await profile.close()
})

test('deleting the selected address blocks payment and an unrelated account cannot read the draft', async ({
  page,
  browser,
  request,
}) => {
  await buy(page)
  const checkoutUrl = page.url()
  await page.getByTestId('checkout-address').click()
  await page.getByTestId('delete-address').click()
  await page.locator('uni-modal').getByText('删除', { exact: true }).click()
  await expect(page.getByTestId('address-empty')).toBeVisible()
  await page.getByTestId('address-back').click()
  await expect(page.getByTestId('confirm-payment')).toHaveAttribute('disabled', 'true')
  expect((await state(request)).orders).toHaveLength(0)
  const other = await browser.newPage()
  try {
    await other.goto(root)
    await other.getByTestId('auth-register').click()
    await other
      .getByTestId('auth-phone')
      .locator('input')
      .fill(`1${randomInt(1e9, 1e10)}`)
    await other.getByTestId('auth-password').locator('input').fill('123456')
    await other.getByTestId('auth-submit').click()
    await expect(other.getByTestId('home-hero')).toBeVisible()
    await other.goto(checkoutUrl)
    await expect(other.getByTestId('checkout-missing')).toBeVisible()
    await expect(other.getByTestId('confirm-payment')).toHaveCount(0)
  } finally {
    await other.close()
  }
})
