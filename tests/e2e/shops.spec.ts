import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { randomInt, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'

const root = 'http://127.0.0.1:4173/#/'
const api = 'http://127.0.0.1:8787/api/demo'
type Merchant = { token: string; role: string; account: { shopId: string } }
let merchants: Merchant[] = []
async function command(
  request: APIRequestContext,
  merchant: Merchant,
  data: Record<string, unknown>,
) {
  const response = await request.post(`${api}/commands`, {
    headers: {
      Authorization: `Bearer ${merchant.token}`,
      'X-Demo-Role': 'merchant',
      'X-Idempotency-Key': randomUUID(),
    },
    data,
  })
  expect(response.ok()).toBe(true)
  return response.json()
}
async function shop(request: APIRequestContext, name: string) {
  const response = await request.post(`${api}/auth/register`, {
    data: {
      role: 'merchant',
      phone: `1${randomInt(1_000_000_000, 10_000_000_000)}`,
      password: '123456',
      shopName: name,
      qualificationCode: '1234',
    },
  })
  expect(response.ok()).toBe(true)
  const merchant: Merchant = (await response.json()).session
  merchants.push(merchant)
  return merchant
}
async function product(request: APIRequestContext, merchant: Merchant, title: string, stock = 2) {
  const response = await command(request, merchant, {
    type: 'createProduct',
    title,
    price: '29',
    stock: String(stock),
    cover: '/static/demo/star-fairy.jpg',
  })
  return response.state.products[0].id as string
}
async function browse(page: Page) {
  await page.goto(root)
  await page.getByTestId('auth-browse').click()
  await expect(page.getByTestId('sync-status')).toContainText('已连接')
}
async function search(page: Page, value: string) {
  await page.getByTestId('product-search').locator('input').fill(value)
}
test.beforeEach(async ({ request }) => {
  merchants = []
  const response = await request.post(`${api}/auth/login`, {
    data: { role: 'merchant', phone: '13800000000', password: '123456' },
  })
  expect(response.ok()).toBe(true)
  await command(request, (await response.json()).session, { type: 'reset' })
})
test.afterEach(async ({ request }) => {
  for (const merchant of merchants) await command(request, merchant, { type: 'reset' })
})

test('search finds a shop and its published goods, opens its storefront and preserves the search on return', async ({
  page,
  request,
}) => {
  const name = `纸月工作室${randomUUID().slice(0, 6)}`
  const merchant = await shop(request, name)
  const other = await shop(request, `另一间店${randomUUID().slice(0, 6)}`)
  const id = await product(request, merchant, '雾灯徽章')
  const hidden = await product(request, merchant, '还未上架的挂件')
  await command(request, merchant, { type: 'toggleProduct', id: hidden })
  const foreign = await product(request, other, '另一家店的明信片')
  await browse(page)
  await search(page, name)
  await expect(page.getByTestId(`shop-${merchant.account.shopId}`)).toContainText('1 款上架商品')
  await expect(page.getByTestId(`product-${id}`)).toBeVisible()
  await expect(page.getByTestId(`product-${hidden}`)).toHaveCount(0)
  await expect(page.getByTestId(`product-${foreign}`)).toHaveCount(0)
  await mkdir('.tools/previews', { recursive: true })
  await page.screenshot({ path: '.tools/previews/shop-search.png', fullPage: true })
  await page.getByTestId(`shop-${merchant.account.shopId}`).click()
  await expect(page).toHaveURL(new RegExp(`pages/shop/detail\\?id=${merchant.account.shopId}`))
  await expect(page.getByTestId('shop-detail-name')).toHaveText(name)
  await expect(page.getByTestId('shop-product-count')).toHaveText('1 款上架商品')
  await expect(page.locator('.product-card')).toHaveCount(1)
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '.tools/previews/shop-detail.png', fullPage: true })
  await page.getByTestId(`product-${id}`).click()
  await expect(page.getByTestId('detail-title')).toHaveText('雾灯徽章')
  await page.getByTestId('visit-shop').click()
  await expect(page.getByTestId('shop-detail-name')).toHaveText(name)
  await page.getByTestId('shop-back').click()
  await expect(page.getByTestId('detail-title')).toBeVisible()
  await page.getByLabel('返回', { exact: true }).click()
  await expect(page.getByTestId('shop-detail-name')).toHaveText(name)
  await page.getByTestId('shop-back').click()
  await expect(page.getByTestId('product-search').locator('input')).toHaveValue(name)
  await expect(page.getByTestId(`shop-${merchant.account.shopId}`)).toBeVisible()
})

test('shop search trims spaces, ignores letter case and works while an event category was selected', async ({
  page,
  request,
}) => {
  const name = `PaperMoon-${randomUUID().slice(0, 6)}`
  const merchant = await shop(request, name)
  const title = `月色徽章${randomUUID().slice(0, 6)}`
  const id = await product(request, merchant, title)
  await browse(page)
  await page.locator('.discovery-tab').filter({ hasText: '漫展' }).click()
  await expect(page.getByText('下一站，见同好')).toBeVisible()
  await search(page, `  ${name.toUpperCase()}  `)
  await expect(page.getByTestId(`shop-${merchant.account.shopId}`)).toBeVisible()
  await expect(page.getByTestId(`product-${id}`)).toBeVisible()
  await expect(page.getByText('下一站，见同好')).toHaveCount(0)
  await search(page, title)
  await expect(page.getByTestId('shop-results')).toHaveCount(0)
  await expect(page.getByTestId(`product-${id}`)).toBeVisible()
  await search(page, '不存在的商品和店铺XYZ')
  await expect(page.getByText('这一份心动还没出现')).toBeVisible()
  await page.getByLabel('清空搜索', { exact: true }).click()
  await expect(page.getByText('下一站，见同好')).toBeVisible()
})

test('empty registered shops are searchable and missing shop routes return to the home page', async ({
  page,
  request,
}) => {
  const name = `准备营业的小店${randomUUID().slice(0, 6)}`
  const merchant = await shop(request, name)
  await browse(page)
  await search(page, name)
  await expect(page.getByTestId(`shop-${merchant.account.shopId}`)).toContainText('0 款上架商品')
  await expect(page.getByText('这一份心动还没出现')).toHaveCount(0)
  await page.getByTestId(`shop-${merchant.account.shopId}`).click()
  await expect(page.getByTestId('shop-empty')).toContainText('暂时没有上架商品')
  await page.reload()
  await expect(page.getByTestId('shop-detail-name')).toHaveText(name)
  await expect(page.getByTestId('shop-empty')).toBeVisible()
  await page.getByTestId('shop-home').click()
  await page.goto(`${root}pages/shop/detail?id=missing-shop`)
  await expect(page.getByTestId('shop-missing')).toContainText('没有找到这间小店')
  await page.getByTestId('shop-home').click()
  await expect(page.getByTestId('home-hero')).toBeVisible()
})

test('a storefront follows shop edits, stock alerts, unpublishing and republishing', async ({
  page,
  request,
}) => {
  const name = `星灯小店${randomUUID().slice(0, 6)}`
  const merchant = await shop(request, name)
  const id = await product(request, merchant, '星灯徽章')
  await browse(page)
  await search(page, name)
  await page.getByTestId(`shop-${merchant.account.shopId}`).click()
  await command(request, merchant, {
    type: 'editShop',
    name: `${name}新名字`,
    description: '新的店铺介绍',
  })
  await expect(page.getByTestId('shop-detail-name')).toHaveText(`${name}新名字`)
  await expect(page.getByTestId('shop-detail-description')).toHaveText('新的店铺介绍')
  await command(request, merchant, {
    type: 'editProduct',
    id,
    title: '星灯徽章',
    price: '29',
    stock: '1',
  })
  await expect(page.getByTestId(`stock-${id}`)).toHaveText('库存紧张，仅剩 1 件')
  await command(request, merchant, { type: 'toggleProduct', id })
  await expect(page.getByTestId('shop-empty')).toBeVisible()
  await expect(page.getByTestId(`product-${id}`)).toHaveCount(0)
  await command(request, merchant, {
    type: 'editProduct',
    id,
    title: '星灯徽章',
    price: '29',
    stock: '0',
  })
  await command(request, merchant, { type: 'toggleProduct', id })
  await expect(page.getByTestId(`stock-${id}`)).toHaveText('已售罄')
  await page.getByTestId(`product-${id}`).click()
  await expect(page.getByTestId('buy-now')).toHaveAttribute('disabled', 'true')
})

test('a visitor can register after choosing a store product and the purchase belongs to that shop', async ({
  page,
  request,
}) => {
  const name = `晨光小店${randomUUID().slice(0, 6)}`
  const merchant = await shop(request, name)
  const id = await product(request, merchant, '晨光挂件')
  await browse(page)
  await search(page, name)
  await page.getByTestId(`shop-${merchant.account.shopId}`).click()
  await page.getByTestId(`product-${id}`).click()
  await page.getByTestId('buy-now').click()
  await expect(page.getByTestId('auth-screen')).toBeVisible()
  await page.getByTestId('auth-register').click()
  await page
    .getByTestId('auth-phone')
    .locator('input')
    .fill(`1${randomInt(1_000_000_000, 10_000_000_000)}`)
  await page.getByTestId('auth-password').locator('input').fill('123456')
  await page.getByTestId('auth-submit').click()
  await expect(page).toHaveURL(new RegExp(`product/detail\\?id=${id}`))
  await page.getByTestId('buy-now').click()
  await page.getByTestId('confirm-sku').click()
  await page.getByText('模拟支付', { exact: true }).click()
  await expect(page.getByText('实付 ¥29', { exact: true })).toBeVisible()
  const response = await request.get(`${api}/state`, {
    headers: { Authorization: `Bearer ${merchant.token}`, 'X-Demo-Role': 'merchant' },
  })
  const state = (await response.json()).state
  expect(state.orders).toHaveLength(1)
  expect(state.orders[0].shopName).toBe(name)
  expect(state.orders[0].productId).toBe(id)
  expect(state.products[0].stock).toBe(1)
  await page.getByTestId(`user-order-${state.orders[0].id}`).click()
  await expect(page.getByTestId('order-detail-shop')).toHaveText(name)
})

test('a direct store login returns to the store and legacy demo products open the default shop', async ({
  page,
}) => {
  await page.goto(`${root}pages/shop/detail?id=demo-shop`)
  await expect(page.getByTestId('auth-screen')).toBeVisible()
  await page.getByTestId('auth-phone').locator('input').fill('13800000000')
  await page.getByTestId('auth-password').locator('input').fill('123456')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('shop-detail-name')).toHaveText('星屿周边馆')
  await expect(page.getByTestId('shop-product-count')).toHaveText('4 款上架商品')
  await page.getByTestId('product-star-fairy').click()
  await page.getByTestId('visit-shop').click()
  await expect(page).toHaveURL(/pages\/shop\/detail\?id=demo-shop/)
  await expect(page.getByTestId('shop-detail-name')).toHaveText('星屿周边馆')
})
