import { pay } from './checkout-flows'
import { test, expect } from './fixtures'
import type { APIRequestContext, Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const user = 'http://127.0.0.1:4173/#/pages/index/index'
const detail = 'http://127.0.0.1:4173/#/pages/product/detail?id=star-fairy'
const api = 'http://127.0.0.1:8787/api/demo'
async function command(request: APIRequestContext, data: Record<string, unknown>) {
  const response = await request.post(`${api}/commands`, {
    headers: { 'X-Demo-Role': 'merchant', 'X-Idempotency-Key': randomUUID() },
    data,
  })
  expect(response.ok()).toBe(true)
  return response.json()
}
async function stock(request: APIRequestContext, quantity: number) {
  return command(request, {
    type: 'editProduct',
    id: 'star-fairy',
    title: '星之花旅人 · 樱粉手办',
    price: '128',
    stock: String(quantity),
  })
}
async function snapshot(request: APIRequestContext) {
  return (await (await request.get(`${api}/state`, { headers: { 'X-Demo-Role': 'user' } })).json())
    .state
}
async function cart(page: Page) {
  await page.goto(detail)
  await expect(page.getByTestId('detail-title')).toBeVisible()
  await page.getByTestId('add-to-cart').click()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('detail-cart-count')).toHaveText('1')
  await page.getByLabel('购物车', { exact: true }).click()
}
test.beforeEach(async ({ request }) => {
  await command(request, { type: 'reset' })
})

test('a newly published single-unit product keeps its identity and shows low stock', async ({
  page,
  request,
}) => {
  await page.goto(user)
  await expect(page.getByTestId('sync-status')).toContainText('已连接')
  const created = await command(request, {
    type: 'createProduct',
    title: '仅一件的测试商品',
    price: '29',
    stock: '1',
    cover: '/static/demo/star-fairy.jpg',
  })
  const id = created.state.products[0].id
  await expect(page.getByTestId(`stock-${id}`)).toHaveText('库存紧张，仅剩 1 件')
  await page.getByTestId(`product-${id}`).click()
  await expect(page).toHaveURL(new RegExp(`id=${id}`))
  await expect(page.getByTestId('detail-title')).toHaveText('仅一件的测试商品')
  await expect(page.getByTestId('detail-stock')).toHaveText('库存紧张，仅剩 1 件')
  await page.getByTestId('buy-now').click()
  await expect(page.getByTestId('sku-stock')).toHaveText('库存紧张，仅剩 1 件')
  await expect(page.getByTestId('sku-quantity')).toHaveText('1')
  await expect(page.getByTestId('quantity-plus')).toHaveAttribute('disabled', 'true')
  await page.getByTestId('quantity-plus').click({ force: true })
  await expect(page.getByTestId('sku-quantity')).toHaveText('1')
  expect((await snapshot(request)).orders).toHaveLength(0)
})

test('a live inventory drop reduces the selection and sold-out goods cannot be purchased again', async ({
  page,
  request,
}) => {
  await page.goto(detail)
  await page.getByTestId('buy-now').click()
  await page.getByTestId('quantity-plus').click()
  await expect(page.getByTestId('sku-quantity')).toHaveText('2')
  await stock(request, 1)
  await expect(page.getByTestId('sku-stock')).toContainText('仅剩 1 件')
  await expect(page.getByTestId('sku-quantity')).toHaveText('1')
  await expect(page.getByTestId('quantity-plus')).toHaveAttribute('disabled', 'true')
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('checkout-page')).toContainText('¥128')
  await pay(page)
  await expect(page.getByText('实付 ¥128', { exact: true })).toBeVisible()
  const paid = await snapshot(request)
  expect(paid.orders).toHaveLength(1)
  expect(paid.orders[0].quantity).toBe(1)
  expect(paid.products.find((p: { id: string }) => p.id === 'star-fairy').stock).toBe(0)
  await page.goto(detail)
  await expect(page.getByTestId('detail-stock')).toHaveText('已售罄')
  await expect(page.getByTestId('buy-now')).toHaveAttribute('disabled', 'true')
  await expect(page.getByTestId('add-to-cart')).toHaveAttribute('disabled', 'true')
  await stock(request, 3)
  await expect(page.getByTestId('detail-stock')).toHaveText('库存紧张，仅剩 3 件')
  await expect(page.getByTestId('buy-now')).not.toHaveAttribute('disabled', 'true')
})

test('stock reduced after payment confirmation rejects the original two-unit order', async ({
  page,
  request,
}) => {
  await page.goto(detail)
  await page.getByTestId('buy-now').click()
  await page.getByTestId('quantity-plus').click()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('checkout-page')).toContainText('¥256')
  await stock(request, 1)
  await expect(page.getByTestId('checkout-error')).toContainText('库存不足，仅剩 1 件')
  await expect(page.getByTestId('confirm-payment')).toHaveAttribute('disabled', 'true')
  await page.getByTestId('checkout-back').click()
  await page.getByTestId('buy-now').click()
  await expect(page.getByTestId('sku-quantity')).toHaveText('1')
  const saved = await snapshot(request)
  expect(saved.orders).toHaveLength(0)
  expect(saved.products.find((p: { id: string }) => p.id === 'star-fairy').stock).toBe(1)
})

test('cart checks the combined selected quantity across variants against one unit of stock', async ({
  page,
  request,
}) => {
  await page.goto(detail)
  await page.getByTestId('add-to-cart').click()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('detail-cart-count')).toHaveText('1')
  await page.getByTestId('add-to-cart').click()
  await page.getByTestId('variant-gift').click()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('detail-cart-count')).toHaveText('2')
  await page.getByLabel('购物车', { exact: true }).click()
  await stock(request, 1)
  await expect(page.getByTestId('cart-stock-error')).toContainText('库存不足，仅剩 1 件')
  await expect(page.getByTestId('cart-checkout')).toHaveAttribute('disabled', 'true')
  for (const button of await page.getByLabel('增加数量', { exact: true }).all())
    await expect(button).toHaveAttribute('disabled', 'true')
  const gift = page.getByTestId('cart-item-star-fairy').filter({ hasText: '礼盒版' })
  await gift.getByLabel('选择商品', { exact: true }).click()
  await expect(page.getByTestId('cart-checkout')).not.toHaveAttribute('disabled', 'true')
  await page.getByTestId('cart-checkout').click()
  await pay(page)
  await expect(page.getByText('实付 ¥128', { exact: true })).toBeVisible()
  const paid = await snapshot(request)
  expect(paid.orders).toHaveLength(1)
  expect(paid.orders[0].quantity).toBe(1)
})

for (const source of ['cart', 'buy'] as const) {
  test(`a lost last-unit ${source} payment can be recovered without another deduction`, async ({
    page,
    request,
  }) => {
    await stock(request, 1)
    if (source === 'cart') await cart(page)
    else {
      await page.goto(detail)
      await page.getByTestId('buy-now').click()
    }
    let lose = true
    await page.route('**/api/demo/commands', async (route) => {
      if (route.request().method() === 'POST' && lose) {
        lose = false
        expect((await route.fetch()).ok()).toBe(true)
        await route.abort('failed')
      } else await route.continue()
    })
    await page.getByTestId(source === 'cart' ? 'cart-checkout' : 'confirm-sku').click()
    await pay(page, false)
    await expect(
      page.getByText('暂时无法连接演示服务，请检查服务后重试', { exact: true }),
    ).toBeVisible()
    await expect
      .poll(
        async () =>
          (await snapshot(request)).products.find((p: { id: string }) => p.id === 'star-fairy')
            .stock,
      )
      .toBe(0)
    await expect(page.getByTestId('checkout-item-stock')).toContainText('已售罄')
    await expect(page.getByTestId('confirm-payment')).not.toHaveAttribute('disabled', 'true')
    await pay(page)
    await expect(page.getByText('实付 ¥128', { exact: true })).toBeVisible()
    const saved = await snapshot(request)
    expect(saved.orders).toHaveLength(1)
    expect(saved.products.find((p: { id: string }) => p.id === 'star-fairy').stock).toBe(0)
  })
}
