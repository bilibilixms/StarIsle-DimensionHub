import { pay } from './checkout-flows'
import { test, expect } from './fixtures'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const user = 'http://127.0.0.1:4173/#/pages/index/index'
const merchant = 'http://127.0.0.1:4174/#/pages/index/index'

async function command(
  request: import('@playwright/test').APIRequestContext,
  role: 'user' | 'merchant',
  data: Record<string, unknown>,
) {
  const response = await request.post('http://127.0.0.1:8787/api/demo/commands', {
    headers: { 'X-Demo-Role': role, 'X-Idempotency-Key': randomUUID() },
    data,
  })
  expect(response.ok()).toBe(true)
  return response.json()
}
test.beforeEach(async ({ request }) => {
  await command(request, 'merchant', { type: 'reset' })
})

test('shopping preserves local favorites and shares paid orders with the demo service', async ({
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
  await page.getByTestId('show-favorites').click()
  await page.getByText('星之花旅人 · 樱粉手办', { exact: true }).click()
  await expect(page).toHaveURL(/pages\/product\/detail\?id=star-fairy/)
  await page.getByLabel('返回', { exact: true }).click()
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
  await pay(page)
  await expect(page.getByText('实付 ¥316', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByTestId('nav-profile').click()
  await expect(page.getByText('实付 ¥316', { exact: true })).toBeVisible()
  await page.getByTestId('nav-cart').click()
  await expect(page.getByText('口袋里还没有心动好物')).toBeVisible()
  expect(apiRequests.some((url) => url.includes('/api/demo/commands'))).toBe(true)
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
  await pay(page)
  await expect(page.getByText('实付 ¥158', { exact: true })).toBeVisible()
  await page.getByTestId('nav-cart').click()
  await expect(page.getByTestId('cart-total')).toHaveText('¥128')
})

test('merchant shipment validates tracking and persists the new order status', async ({
  page,
  request,
}) => {
  const paid = await command(request, 'user', {
    type: 'checkout',
    items: [{ productId: 'star-fairy', variant: 'standard', quantity: 1, expectedPrice: 12800 }],
    recipient: { name: '演示买家', phone: '13800000000', address: '上海市 演示路 1 号' },
  })
  const id = paid.orderIds[0]
  await page.goto(merchant)
  await page.getByTestId('waiting-orders').click()
  await expect(page.getByTestId(`order-${id}`)).toBeVisible()
  await page.getByTestId(`ship-${id}`).click()
  await page.getByTestId('confirm-ship').click()
  await expect(page.getByTestId('ship-error')).toContainText('8–24')
  await page.getByTestId('ship-tracking').locator('input').fill('SF1234567890')
  await page.getByTestId('confirm-ship').click()
  await expect(page.getByTestId(`order-${id}`)).toHaveCount(0)
  await page.getByTestId('status-待收货').click()
  await expect(page.getByTestId(`order-${id}`)).toContainText('待收货')
  await page.reload()
  await page.getByTestId('nav-orders').click()
  await page.getByTestId('status-待收货').click()
  await expect(page.getByTestId(`order-${id}`)).toContainText('待收货')
  await page.getByTestId(`order-${id}`).getByText('查看详情').click()
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

async function snapshot(
  request: import('@playwright/test').APIRequestContext,
  role: 'user' | 'merchant' = 'user',
) {
  const response = await request.get('http://127.0.0.1:8787/api/demo/state', {
    headers: { 'X-Demo-Role': role },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()).state
}
async function putOneInCart(page: import('@playwright/test').Page) {
  await page.goto(user)
  await page.getByTestId('product-star-fairy').click()
  await page.getByTestId('add-to-cart').click()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('detail-cart-count')).toHaveText('1')
  await page.getByLabel('购物车', { exact: true }).click()
}

test('merchant publishes a product and the two live apps complete the same order', async ({
  page,
  context,
  request,
}) => {
  await page.goto(user)
  await expect(page.getByTestId('sync-status')).toContainText('已连接')
  const shop = await context.newPage()
  await shop.goto(merchant)
  await expect(shop.getByTestId('sync-status')).toContainText('已连接')
  await shop.getByTestId('publish-product').click()
  await shop.getByTestId('edit-product-title').locator('input').fill('联动限定挂件')
  await shop.getByTestId('edit-product-price').locator('input').fill('39.90')
  await shop.getByTestId('edit-product-stock').locator('input').fill('2')
  await shop.getByTestId('save-product').click()
  await expect(shop.getByText('新品已上架', { exact: true })).toBeVisible()
  const product = (await snapshot(request)).products.find(
    (item: { title: string }) => item.title === '联动限定挂件',
  )
  await expect(page.getByTestId(`product-${product.id}`)).toBeVisible()
  await page.getByTestId('nav-profile').click()
  await page.getByTestId('edit-recipient').click()
  await page.getByTestId('recipient-name').locator('input').fill('小岛体验者')
  await page.getByTestId('recipient-phone').locator('input').fill('13800000001')
  await page
    .getByTestId('recipient-address')
    .locator('input')
    .fill('上海市 联动路 8 号（演示地址）')
  await page.getByTestId('save-recipient').click()
  await page.getByTestId('nav-home').click()
  await page.getByTestId(`product-${product.id}`).click()
  await page.getByTestId('buy-now').click()
  await expect(page.getByText('上海市 联动路 8 号（演示地址）', { exact: true })).toBeVisible()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('checkout-page')).toContainText('联动路 8 号')
  await pay(page)
  await expect(page.getByText('实付 ¥39.90', { exact: true })).toBeVisible()
  const order = (await snapshot(request)).orders[0]
  await expect(shop.getByTestId(`order-${order.id}`)).toBeVisible()
  expect(
    (await snapshot(request)).products.find((item: { id: string }) => item.id === product.id).stock,
  ).toBe(1)
  await shop.getByTestId(`ship-${order.id}`).click()
  await expect(shop.getByText(/上海市 联动路 8 号/)).toBeVisible()
  await shop.getByTestId('ship-tracking').locator('input').fill('SF202610310001')
  await shop.getByTestId('confirm-ship').click()
  const userOrder = page.getByTestId(`user-order-${order.id}`)
  await expect(userOrder).toContainText('待收货')
  await expect(userOrder).toContainText('SF202610310001')
  await shop.getByTestId('status-已完成').click()
  await page.getByTestId(`receive-${order.id}`).click()
  await page.locator('uni-modal').getByText('确认收货', { exact: true }).click()
  await expect(userOrder).toContainText('已完成')
  await expect(shop.getByTestId(`order-${order.id}`)).toContainText('已完成')
  await page.reload()
  await page.getByTestId('nav-profile').click()
  await expect(page.getByTestId(`user-order-${order.id}`)).toContainText('已完成')
  await shop.reload()
  await shop.getByTestId('nav-orders').click()
  await expect(shop.getByTestId(`order-${order.id}`)).toContainText('已完成')
  await shop.close()
})

test('a lost payment response can be retried after reload without a second order', async ({
  page,
  request,
}) => {
  await putOneInCart(page)
  let loseResponse = true
  await page.route('**/api/demo/commands', async (route) => {
    if (route.request().method() === 'POST' && loseResponse) {
      loseResponse = false
      const committed = await route.fetch()
      expect(committed.ok()).toBe(true)
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByTestId('cart-checkout').click()
  await pay(page, false)
  await expect(
    page.getByText('暂时无法连接演示服务，请检查服务后重试', { exact: true }),
  ).toBeVisible()
  expect((await snapshot(request)).orders).toHaveLength(1)
  await page.reload()
  await page.getByTestId('checkout-back').click()
  await page.getByTestId('nav-cart').click()
  await expect(page.getByTestId('cart-total')).toHaveText('¥128')
  await page.getByTestId('cart-checkout').click()
  await pay(page)
  await expect(page.getByText('实付 ¥128', { exact: true })).toBeVisible()
  const state = await snapshot(request)
  expect(state.orders).toHaveLength(1)
  expect(state.products.find((item: { id: string }) => item.id === 'star-fairy').stock).toBe(35)
  await page.getByTestId('nav-cart').click()
  await expect(page.getByText('口袋里还没有心动好物')).toBeVisible()
})

test('offline payment fails visibly and reconnecting restores the shared flow', async ({
  page,
  request,
}) => {
  await putOneInCart(page)
  await page.route('**/api/demo/**', (route) => route.abort('failed'))
  await expect(page.getByTestId('sync-status')).toContainText('联动暂未连接')
  await page.getByTestId('cart-checkout').click()
  await expect(
    page.getByText('暂时无法连接演示服务，请检查服务后重试', { exact: true }),
  ).toBeVisible()
  expect((await snapshot(request)).orders).toHaveLength(0)
  await page.unroute('**/api/demo/**')
  await page.getByTestId('retry-sync').click()
  await expect(page.getByTestId('sync-status')).toContainText('已连接')
  await page.getByTestId('cart-checkout').click()
  await pay(page)
  await expect(page.getByText('实付 ¥128', { exact: true })).toBeVisible()
  expect((await snapshot(request)).orders).toHaveLength(1)
})

test('a merchant price change during payment confirmation requires a new confirmation', async ({
  page,
  request,
}) => {
  await putOneInCart(page)
  await page.getByTestId('cart-checkout').click()
  await expect(page.getByTestId('checkout-page')).toContainText('¥128')
  await command(request, 'merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '星之花旅人 · 樱粉手办',
    price: '139',
    stock: '36',
  })
  await expect(page.getByTestId('checkout-error')).toContainText('商品价格已变化')
  await expect(page.getByTestId('confirm-payment')).toHaveAttribute('disabled', 'true')
  expect((await snapshot(request)).orders).toHaveLength(0)
  await page.getByTestId('checkout-refresh').click()
  await expect(page.getByTestId('checkout-total')).toHaveText('¥139')
  await pay(page)
  await expect(page.getByText('实付 ¥139', { exact: true })).toBeVisible()
})
