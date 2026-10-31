import { pay } from './checkout-flows'
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { randomInt, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'

const root = 'http://127.0.0.1:4173/#/'
const api = 'http://127.0.0.1:8787/api/demo'
const phone = () => `1${randomInt(1_000_000_000, 10_000_000_000)}`
async function credentials(page: Page, number: string, password = '123456') {
  await page.getByTestId('auth-phone').locator('input').fill(number)
  await page.getByTestId('auth-password').locator('input').fill(password)
}
async function register(page: Page, number: string, role = 'user', shop = '') {
  await page.goto(`${root}pages/auth/index?role=${role}`)
  await page.getByTestId('auth-register').click()
  await credentials(page, number)
  if (shop) await page.getByTestId('auth-shop').locator('input').fill(shop)
  await page.getByTestId('auth-submit').click()
  if (role === 'merchant') {
    await expect(page.getByTestId('merchant-demo-code')).toContainText('1234')
    await page.getByTestId('merchant-verification-code').locator('input').fill('1234')
    await page.getByTestId('auth-submit').click()
  }
  await expect(page.getByTestId(role === 'merchant' ? 'waiting-orders' : 'home-hero')).toBeVisible()
}
async function login(page: Page, number: string, role = 'user') {
  await page.goto(`${root}pages/auth/index?role=${role}`)
  await credentials(page, number)
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId(role === 'merchant' ? 'waiting-orders' : 'home-hero')).toBeVisible()
}
async function session(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('starisle.auth.session')!).data)
}
async function state(request: APIRequestContext, token?: string) {
  return (
    await (
      await request.get(`${api}/state`, {
        headers: { 'X-Demo-Role': 'user', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
    ).json()
  ).state
}
async function command(
  request: APIRequestContext,
  data: object,
  auth: { role: string; token: string },
) {
  return request.post(`${api}/commands`, {
    headers: {
      'X-Demo-Role': auth.role,
      Authorization: `Bearer ${auth.token}`,
      'X-Idempotency-Key': randomUUID(),
    },
    data,
  })
}

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${api}/auth/login`, {
    data: { role: 'merchant', phone: '13800000000', password: '123456' },
  })
  expect(response.ok()).toBe(true)
  expect((await command(request, { type: 'reset' }, (await response.json()).session)).ok()).toBe(
    true,
  )
})

test('the unified entry shows four roles, keeps future roles closed and limits guest access to users', async ({
  page,
}) => {
  await page.goto(root)
  await expect(page.getByTestId('auth-screen')).toBeVisible()
  await expect(page.getByTestId('auth-browse')).toBeVisible()
  for (const role of ['artist', 'event']) {
    await page.getByTestId(`role-${role}`).click()
    await expect(page.getByTestId('auth-coming-soon')).toContainText('暂未开放')
    await expect(page.getByTestId('auth-submit')).toHaveCount(0)
    await expect(page.getByTestId('auth-browse')).toHaveCount(0)
  }
  await page.getByTestId('role-merchant').click()
  await expect(page.getByTestId('auth-submit')).toHaveText('登录商家工作台')
  await expect(page.getByTestId('auth-browse')).toHaveCount(0)
  await page.getByTestId('auth-register').click()
  await expect(page.getByTestId('auth-shop')).toBeVisible()
  await mkdir('.tools/previews', { recursive: true })
  for (const role of ['user', 'merchant']) {
    await page.getByTestId(`role-${role}`).click()
    for (const width of [375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: `.tools/previews/auth-${role}.png`, fullPage: true })
  }
})

test('phone and six-character password validation allows direct registration, persists login and rejects duplicates', async ({
  page,
  request,
}) => {
  const number = phone()
  await page.goto(root)
  await page.getByTestId('auth-register').click()
  await credentials(page, '123', '12345')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('auth-error')).toHaveText('请填写 11 位手机号')
  await credentials(page, number, '12345')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('auth-error')).toContainText('6–128')
  await credentials(page, number)
  await page.getByLabel('显示密码', { exact: true }).click()
  await expect(page.getByTestId('auth-password').locator('input')).toHaveAttribute('type', 'text')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('home-hero')).toBeVisible()
  const original = await session(page)
  await page.reload()
  await expect(page.getByTestId('home-hero')).toBeVisible()
  await page.getByTestId('nav-profile').click()
  await expect(page.getByTestId('favorite-count')).toHaveText('0')
  await page.getByTestId('logout').click()
  await expect(page.getByTestId('auth-screen')).toBeVisible()
  expect(
    (
      await request.get(`${api}/state`, { headers: { Authorization: `Bearer ${original.token}` } })
    ).status(),
  ).toBe(401)
  await page.getByTestId('auth-register').click()
  await credentials(page, number)
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('auth-error')).toContainText('已注册此身份')
  await page.getByTestId('auth-login').click()
  await credentials(page, number, 'wrong-password')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('auth-error')).toHaveText('手机号或密码不正确')
  await credentials(page, number)
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('home-hero')).toBeVisible()
  expect((await session(page)).account.id).toBe(original.account.id)
})

test('guests browse products, are stopped before writes and return to the selected product after registering', async ({
  page,
  request,
}) => {
  await page.goto(root)
  await page.getByTestId('auth-browse').click()
  await page.getByTestId('product-search').locator('input').fill('樱粉')
  await page.getByTestId('product-star-fairy').click()
  await expect(page.getByTestId('detail-title')).toContainText('樱粉')
  await page.getByTestId('buy-now').click()
  await expect(page.getByTestId('auth-screen')).toBeVisible()
  expect((await state(request)).orders).toHaveLength(0)
  await page.getByTestId('auth-register').click()
  await credentials(page, phone())
  await page.getByTestId('auth-submit').click()
  await expect(page).toHaveURL(/pages\/product\/detail\?id=star-fairy/)
  await expect(page.getByTestId('detail-title')).toBeVisible()
  await page.getByTestId('buy-now').click()
  await page.getByTestId('confirm-sku').click()
  await pay(page)
  await expect(page.getByText('实付 ¥128', { exact: true })).toBeVisible()
  const current = await session(page)
  expect((await state(request, current.token)).orders).toHaveLength(1)
  expect((await state(request)).orders).toHaveLength(0)
})

test('direct private routes and guest cart navigation require the appropriate login', async ({
  page,
}) => {
  await page.goto(`${root}pages/merchant/index`)
  await expect(page.getByTestId('auth-submit')).toHaveText('登录商家工作台')
  await expect(page.getByTestId('auth-browse')).toHaveCount(0)
  await page.goto(`${root}pages/order/detail?id=unknown`)
  await expect(page.getByTestId('auth-screen')).toBeVisible()
  await expect(page.getByTestId('order-detail-missing')).toHaveCount(0)
  await page.getByTestId('auth-browse').click()
  await page.getByTestId('nav-profile').click()
  await expect(page.getByTestId('guest-login')).toBeVisible()
  await expect(page.getByTestId('edit-recipient')).toHaveCount(0)
  await page.getByTestId('nav-cart').click()
  await expect(page.getByTestId('auth-screen')).toBeVisible()
})

test('switching accounts isolates and restores orders, favorites and cart', async ({
  page,
  request,
}) => {
  const a = phone(),
    b = phone()
  await register(page, a)
  await page.getByTestId('favorite-star-fairy').click()
  await page.getByTestId('product-star-fairy').click()
  await page.getByTestId('add-to-cart').click()
  await page.getByTestId('confirm-sku').click()
  await expect(page.getByTestId('detail-cart-count')).toHaveText('1')
  await page.getByTestId('buy-now').click()
  await page.getByTestId('confirm-sku').click()
  await pay(page)
  await expect(page.getByText('实付 ¥128', { exact: true })).toBeVisible()
  const first = await session(page)
  const orderId = (await state(request, first.token)).orders[0].id
  await page.getByTestId('logout').click()
  await register(page, b)
  await page.getByTestId('nav-profile').click()
  await expect(page.getByTestId('favorite-count')).toHaveText('0')
  await expect(page.getByTestId(`user-order-${orderId}`)).toHaveCount(0)
  await page.getByTestId('nav-cart').click()
  await expect(page.getByText('口袋里还没有心动好物')).toBeVisible()
  await page.getByTestId('nav-profile').click()
  await page.getByTestId('logout').click()
  await login(page, a)
  await page.getByTestId('nav-profile').click()
  await expect(page.getByTestId('favorite-count')).toHaveText('1')
  await expect(page.getByTestId(`user-order-${orderId}`)).toBeVisible()
  await page.getByTestId('nav-cart').click()
  await expect(page.getByTestId('cart-total')).toHaveText('¥128')
})

test('the same account can register a merchant role and enter both roles in one app', async ({
  page,
}) => {
  const number = phone()
  await register(page, number)
  const original = await session(page)
  await page.getByTestId('nav-profile').click()
  await page.getByTestId('switch-role').click()
  await credentials(page, number)
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('auth-error')).toContainText('尚未注册此身份')
  await page.getByTestId('auth-register').click()
  await page.getByTestId('auth-shop').locator('input').fill('新开的星光小店')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('merchant-qualification')).toBeVisible()
  await page.getByTestId('merchant-verification-code').locator('input').fill('1234')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('waiting-orders')).toBeVisible()
  expect((await session(page)).account.id).toBe(original.account.id)
  await page.getByTestId('nav-profile').click()
  await expect(page.getByText('新开的星光小店', { exact: true })).toBeVisible()
  await page.getByTestId('switch-role').click()
  await credentials(page, number)
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('home-hero')).toBeVisible()
})

test('a registered merchant publishes in the unified app and receives only its own orders', async ({
  page,
  browser,
  request,
}) => {
  await register(page, phone(), 'merchant', '联动注册小店')
  const merchant = await session(page)
  await page.getByTestId('nav-products').click()
  await expect(page.getByTestId('managed-star-fairy')).toHaveCount(0)
  await page
    .getByTestId('publish-product')
    .count()
    .then(async (count) => {
      if (!count) await page.getByTestId('nav-home').click()
    })
  await page.getByTestId('publish-product').click()
  await page.getByTestId('edit-product-title').locator('input').fill('注册店铺专属挂件')
  await page.getByTestId('edit-product-price').locator('input').fill('29')
  await page.getByTestId('edit-product-stock').locator('input').fill('2')
  await page.getByTestId('save-product').click()
  await expect(page.getByText('新品已上架', { exact: true })).toBeVisible()
  const product = (await state(request)).products.find(
    (product: { title: string; shopId?: string }) =>
      product.title === '注册店铺专属挂件' && product.shopId === merchant.account.shopId,
  )
  const customer = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await register(customer, phone())
    await customer.getByTestId(`product-${product.id}`).click()
    await expect(customer.getByText('联动注册小店', { exact: true })).toBeVisible()
    await customer.getByTestId('buy-now').click()
    await customer.getByTestId('confirm-sku').click()
    await pay(customer)
    await expect(customer.getByText('实付 ¥29', { exact: true })).toBeVisible()
    const buyer = await session(customer)
    const order = (await state(request, buyer.token)).orders[0]
    await page.getByTestId('nav-orders').click()
    await expect(page.getByTestId(`order-${order.id}`)).toBeVisible()
    await expect(page.locator('.merchant-order')).toHaveCount(1)
  } finally {
    await customer.close()
  }
  expect((await command(request, { type: 'reset' }, merchant)).ok()).toBe(true)
})

test('a revoked login returns to the entry instead of continuing with cached private data', async ({
  page,
  request,
}) => {
  await register(page, phone())
  const original = await session(page)
  await request.post(`${api}/auth/logout`, {
    headers: { Authorization: `Bearer ${original.token}` },
    data: {},
  })
  await page.reload()
  await expect(page.getByTestId('auth-screen')).toBeVisible()
  await expect(page.getByTestId('home-hero')).toHaveCount(0)
})

test('merchant registration verifies the visible fixed code and the same phone can then register as a user', async ({
  page,
  request,
}) => {
  const number = phone()
  let registrations = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/auth/register')) registrations += 1
  })
  await page.goto(`${root}pages/auth/index?role=merchant`)
  await page.getByTestId('auth-register').click()
  await credentials(page, number)
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('merchant-registration-step')).toContainText('2 资质验证')
  await expect(page.getByTestId('merchant-demo-code')).toContainText('1234')
  expect(registrations).toBe(0)
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('auth-error')).toHaveText('请填写商家资质验证码')
  await page.getByTestId('merchant-verification-code').locator('input').fill('0000')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('auth-error')).toContainText('资质验证码不正确')
  expect(registrations).toBe(0)
  const premature = await request.post(`${api}/auth/login`, {
    data: { phone: number, password: '123456', role: 'merchant' },
  })
  expect(premature.status()).toBe(401)
  await page.getByTestId('qualification-back').click()
  await expect(page.getByTestId('auth-phone').locator('input')).toHaveValue(number)
  await expect(page.getByTestId('merchant-qualification')).toHaveCount(0)
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('merchant-verification-code').locator('input')).toHaveValue('')
  await mkdir('.tools/previews', { recursive: true })
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '.tools/previews/auth-merchant-verification.png', fullPage: true })
  await page.getByTestId('merchant-verification-code').locator('input').fill('1234')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('waiting-orders')).toBeVisible()
  expect(registrations).toBe(1)
  const merchant = await session(page)
  await register(page, number, 'user')
  expect((await session(page)).account.id).toBe(merchant.account.id)
  expect((await session(page)).account.roles).toEqual(['merchant', 'user'])
  await login(page, number, 'merchant')
  await expect(page.getByTestId('merchant-verification-code')).toHaveCount(0)
})
