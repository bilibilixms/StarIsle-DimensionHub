import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID, randomInt } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { ADMIN_UI_ENABLED } from '../../packages/shared/src/features'

test.skip(!ADMIN_UI_ENABLED, '管理员界面暂时隐藏，后续启用时恢复验收')
const api = 'http://127.0.0.1:8787/api/demo'
const root = 'http://127.0.0.1:4173/#/'
type Session = { token: string; role: string; account: { id: string; shopId?: string } }
let admin: Session
let merchants: { session: Session; phone: string }[] = []
let accounts: Session[] = []
const phone = () => `1${randomInt(1e9, 1e10)}`
async function call(request: APIRequestContext, path: string, data?: object, session?: Session) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Demo-Role': session?.role || 'user',
    'X-Idempotency-Key': randomUUID(),
    ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
  }
  const response =
    data === undefined
      ? await request.get(`${api}/${path}`, { headers })
      : await request.post(`${api}/${path}`, { headers, data })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}
async function state(request: APIRequestContext) {
  return (await call(request, 'admin/state', undefined, admin)).state
}
async function manage(request: APIRequestContext, data: object) {
  return call(request, 'admin/commands', data, admin)
}
async function loginUI(page: Page, role = 'admin', number = 'admin') {
  await page.goto(`${root}pages/auth/index?role=${role}`)
  await page
    .getByTestId(role === 'admin' ? 'auth-username' : 'auth-phone')
    .locator('input')
    .fill(number)
  await page
    .getByTestId('auth-password')
    .locator('input')
    .fill(role === 'admin' ? '123' : '123456')
  await page.getByTestId('auth-submit').click()
  await expect(
    page.getByTestId(
      role === 'admin' ? 'admin-dashboard' : role === 'merchant' ? 'waiting-orders' : 'home-hero',
    ),
  ).toBeVisible()
}
async function register(request: APIRequestContext, role = 'user', shopName = '') {
  const number = phone()
  const session = (
    await call(request, 'auth/register', {
      role,
      phone: number,
      password: '123456',
      shopName,
      ...(role === 'merchant' ? { qualificationCode: '1234' } : {}),
    })
  ).session as Session
  accounts.push(session)
  if (role === 'merchant') merchants.push({ session, phone: number })
  return { session, phone: number }
}
async function approvedShop(request: APIRequestContext, name: string) {
  const merchant = await register(request, 'merchant', name)
  await manage(request, {
    type: 'reviewShop',
    id: merchant.session.account.shopId,
    version: 0,
    decision: 'approve',
  })
  return merchant
}
async function product(request: APIRequestContext, merchant: Session, title: string) {
  return (
    await call(
      request,
      'commands',
      {
        type: 'createProduct',
        title,
        price: '29',
        stock: '3',
        cover: '/static/demo/star-fairy.jpg',
      },
      merchant,
    )
  ).state.products[0]
}
async function confirm(page: Page, reason?: string) {
  if (reason !== undefined)
    await page.getByTestId('admin-action-reason').locator('textarea').fill(reason)
  await page.getByTestId('admin-confirm-action').click()
  await expect(page.getByTestId('admin-confirm-action')).toHaveCount(0)
}
async function search(page: Page, value: string) {
  await page.getByTestId('admin-search').locator('input').fill(value)
}
test.beforeEach(async ({ request }) => {
  merchants = []
  accounts = []
  admin = (await call(request, 'auth/login', { role: 'admin', username: 'admin', password: '123' }))
    .session
})
test.afterEach(async ({ request }) => {
  for (const account of accounts) {
    const current = (await state(request)).accounts.find(
      (a: { id: string }) => a.id === account.account.id,
    )
    if (current?.disabled)
      await manage(request, {
        type: 'setAccountDisabled',
        id: current.id,
        version: current.managementVersion,
        disabled: false,
      })
  }
  for (const entry of merchants) {
    let current = (await state(request)).shops.find(
      (s: { id: string }) => s.id === entry.session.account.shopId,
    )
    const session = (
      await call(request, 'auth/login', {
        role: 'merchant',
        phone: entry.phone,
        password: '123456',
      })
    ).session
    if (current.status === 'REJECTED') {
      await call(request, 'commands', { type: 'submitShopReview' }, session)
      current = (await state(request)).shops.find(
        (s: { id: string }) => s.id === entry.session.account.shopId,
      )
    }
    if (current.status === 'PENDING')
      await manage(request, {
        type: 'reviewShop',
        id: current.id,
        version: current.managementVersion,
        decision: 'approve',
      })
    if (current.status === 'SUSPENDED')
      await manage(request, {
        type: 'setShopSuspended',
        id: current.id,
        version: current.managementVersion,
        suspended: false,
      })
    for (const p of (await state(request)).products.filter(
      (p: { shopId: string; adminHidden?: boolean }) => p.shopId === current.id && p.adminHidden,
    ))
      await manage(request, {
        type: 'setProductHidden',
        id: p.id,
        version: p.managementVersion,
        hidden: false,
      })
    await call(request, 'commands', { type: 'reset' }, session)
  }
  await call(request, 'auth/logout', {}, admin)
})

test('merchant rejection, editing, resubmission and approval unlock publication and retain review records', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(45000)
  const name = `审核验收${randomUUID().slice(0, 6)}`,
    number = phone()
  const merchant = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const visitor = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await merchant.goto(`${root}pages/auth/index?role=merchant`)
    await merchant.getByTestId('auth-register').click()
    await merchant.getByTestId('auth-phone').locator('input').fill(number)
    await merchant.getByTestId('auth-password').locator('input').fill('123456')
    await merchant.getByTestId('auth-shop').locator('input').fill(name)
    await merchant.getByTestId('auth-submit').click()
    await merchant.getByTestId('merchant-verification-code').locator('input').fill('1234')
    await merchant.getByTestId('auth-submit').click()
    await expect(merchant.getByTestId('merchant-shop-status')).toHaveText('待审核')
    const session = (await merchant.evaluate(
      () => JSON.parse(localStorage.getItem('starisle.auth.session')!).data,
    )) as Session
    accounts.push(session)
    merchants.push({ session, phone: number })
    const id = session.account.shopId
    await expect(merchant.getByTestId('publish-product')).toHaveAttribute('disabled', 'true')
    await loginUI(page)
    await page.getByTestId('admin-pending-shops').click()
    await search(page, name)
    await page.getByTestId(`admin-reject-${id}`).click()
    await page.getByTestId('admin-confirm-action').click()
    await expect(page.getByTestId('admin-action-error')).toHaveText('请填写处理原因')
    await confirm(page, '请完善店铺介绍')
    await expect(merchant.getByTestId('merchant-review-notice')).toContainText('请完善店铺介绍')
    await merchant.getByTestId('merchant-review-edit').click()
    await merchant
      .getByTestId('edit-shop-description')
      .locator('input')
      .fill('已补充完整的原创周边介绍')
    await merchant.getByTestId('save-shop').click()
    await expect(merchant.getByTestId('save-shop')).toHaveCount(0)
    await merchant.getByTestId('merchant-review-resubmit').click()
    await expect(merchant.getByTestId('merchant-shop-status')).toHaveText('待审核')
    await page.getByTestId(`admin-approve-${id}`).click()
    await confirm(page)
    await expect(merchant.getByTestId('merchant-review-notice')).toHaveCount(0)
    await merchant.getByTestId('publish-product').click()
    await merchant
      .getByTestId('edit-product-title')
      .locator('input')
      .fill(name + '挂件')
    await merchant.getByTestId('edit-product-price').locator('input').fill('29')
    await merchant.getByTestId('edit-product-stock').locator('input').fill('1')
    await merchant.getByTestId('save-product').click()
    await expect(merchant.getByText('新品已上架', { exact: true })).toBeVisible()
    const p = (await state(request)).products.find((p: { shopId: string }) => p.shopId === id)
    await visitor.goto(root)
    await visitor.getByTestId('auth-browse').click()
    await expect(visitor.getByTestId(`product-${p.id}`)).toBeVisible()
    await page.getByTestId('admin-tab-logs').click()
    await search(page, name)
    await expect(page.getByTestId('admin-log')).toHaveCount(2)
  } finally {
    await merchant.close()
    await visitor.close()
  }
})

test('account disabling revokes login and restoration creates searchable operation records', async ({
  page,
  browser,
  request,
}) => {
  const buyer = await register(request)
  const customer = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await loginUI(customer, 'user', buyer.phone)
    const old = await customer.evaluate(
      () => JSON.parse(localStorage.getItem('starisle.auth.session')!).data,
    )
    await loginUI(page)
    await page.getByTestId('admin-tab-accounts').click()
    await search(page, buyer.phone)
    await page.getByTestId(`admin-account-action-${buyer.session.account.id}`).click()
    await confirm(page, '演示账号停用检查')
    await expect(customer.getByTestId('auth-screen')).toBeVisible()
    expect(
      (
        await request.get(`${api}/auth/session`, {
          headers: { Authorization: `Bearer ${old.token}` },
        })
      ).status(),
    ).toBe(401)
    await customer.getByTestId('auth-phone').locator('input').fill(buyer.phone)
    await customer.getByTestId('auth-password').locator('input').fill('123456')
    await customer.getByTestId('auth-submit').click()
    await expect(customer.getByTestId('auth-error')).toContainText('账号已被禁用')
    await page.getByTestId(`admin-account-action-${buyer.session.account.id}`).click()
    await confirm(page)
    await customer.getByTestId('auth-submit').click()
    await expect(customer.getByTestId('home-hero')).toBeVisible()
    await page.getByTestId('admin-tab-logs').click()
    await search(page, buyer.phone)
    await expect(page.getByTestId('admin-log')).toHaveCount(2)
  } finally {
    await customer.close()
  }
})

test('product holds and shop suspension synchronize across customer and merchant pages and can be restored', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(45000)
  const name = `展示验收${randomUUID().slice(0, 6)}`
  const merchant = await approvedShop(request, name)
  const p = await product(request, merchant.session, name + '挂件')
  const customer = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const workspace = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await loginUI(workspace, 'merchant', merchant.phone)
    await workspace.getByTestId('nav-products').click()
    await customer.goto(root)
    await customer.getByTestId('auth-browse').click()
    await customer.getByTestId(`product-${p.id}`).click()
    await expect(customer.getByTestId('detail-title')).toHaveText(p.title)
    await loginUI(page)
    await page.getByTestId('admin-tab-products').click()
    await search(page, name)
    await page.getByTestId(`admin-product-action-${p.id}`).click()
    await confirm(page, '图片信息待核实')
    await expect(customer.getByText('这份好物暂时不在岛上')).toBeVisible()
    await expect(workspace.getByTestId(`managed-${p.id}`)).toContainText('图片信息待核实')
    await expect(workspace.getByTestId(`toggle-${p.id}`)).toHaveAttribute('disabled', 'true')
    await page.getByTestId(`admin-product-action-${p.id}`).click()
    await confirm(page)
    await expect(customer.getByTestId('detail-title')).toHaveText(p.title)
    await page.getByTestId('admin-tab-shops').click()
    await search(page, name)
    await page.getByTestId(`admin-shop-action-${merchant.session.account.shopId}`).click()
    await confirm(page, '店铺临时核查')
    await expect(customer.getByText('这份好物暂时不在岛上')).toBeVisible()
    await expect(workspace.getByTestId('merchant-review-notice')).toContainText('店铺临时核查')
    await page.getByTestId(`admin-shop-action-${merchant.session.account.shopId}`).click()
    await confirm(page)
    await expect(customer.getByTestId('detail-title')).toHaveText(p.title)
  } finally {
    await customer.close()
    await workspace.close()
  }
})

test('order lookup retains grouped transaction snapshots and presents a read-only receipt', async ({
  page,
  request,
}) => {
  const name = `订单验收${randomUUID().slice(0, 6)}`
  const merchant = await approvedShop(request, name)
  const first = await product(request, merchant.session, name + '挂件')
  const second = await product(request, merchant.session, name + '明信片')
  const buyer = await register(request)
  const paid = await call(
    request,
    'commands',
    {
      type: 'checkout',
      items: [first, second].map((p) => ({
        productId: p.id,
        variant: 'standard',
        quantity: 1,
        expectedPrice: 2900,
      })),
      recipient: { name: '演示订单收货人', phone: buyer.phone, address: '上海市 订单验收路8号' },
    },
    buyer.session,
  )
  const order = paid.state.orders[0]
  await call(
    request,
    'commands',
    { type: 'editProduct', id: first.id, title: '修改后的商品名', price: '39' },
    merchant.session,
  )
  await loginUI(page)
  await page.getByTestId('admin-tab-orders').click()
  await search(page, order.id)
  await page.getByTestId(`admin-order-${order.id}`).click()
  const detail = page.getByTestId('admin-order-detail')
  await expect(detail).toContainText('¥58')
  await expect(detail).toContainText(first.title)
  await expect(detail).toContainText(second.title)
  await expect(detail).toContainText('订单验收路8号')
  await expect(detail.locator('input,textarea')).toHaveCount(0)
  await expect(detail.getByText('修改后的商品名', { exact: true })).toHaveCount(0)
  await call(
    request,
    'commands',
    { type: 'ship', id: order.id, carrier: '顺丰', tracking: 'SF202611020008' },
    merchant.session,
  )
  await expect(detail).toContainText('待收货')
  await expect(detail).toContainText('SF202611020008')
  await mkdir('.tools/previews', { recursive: true })
  await page.screenshot({ path: '.tools/previews/admin-order-detail.png', fullPage: true })
})

test('stale actions fail and a lost administrator response can be retried without duplicate audit records', async ({
  page,
  request,
}) => {
  const name = `重试验收${randomUUID().slice(0, 6)}`
  const merchant = await approvedShop(request, name)
  const p = await product(request, merchant.session, name + '挂件')
  await loginUI(page)
  await page.getByTestId('admin-tab-products').click()
  await search(page, name)
  await page.getByTestId(`admin-product-action-${p.id}`).click()
  await call(
    request,
    'commands',
    { type: 'editProduct', id: p.id, title: p.title, price: '39' },
    merchant.session,
  )
  await page.getByTestId('admin-action-reason').locator('textarea').fill('人工复核商品')
  await page.getByTestId('admin-confirm-action').click()
  await expect(page.getByTestId('admin-action-error')).toContainText('信息已变化')
  await page.getByTestId('admin-reload-action').click()
  await expect(page.getByTestId(`admin-product-${p.id}`)).toContainText('¥39')
  await page.getByTestId(`admin-product-action-${p.id}`).click()
  let lose = true
  const keys: string[] = []
  await page.route('**/api/demo/admin/commands', async (route) => {
    keys.push(route.request().headers()['x-idempotency-key'])
    if (lose) {
      lose = false
      expect((await route.fetch()).ok()).toBe(true)
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByTestId('admin-action-reason').locator('textarea').fill('人工复核商品')
  await page.getByTestId('admin-confirm-action').click()
  await expect(page.getByTestId('admin-action-error')).toContainText('暂时无法连接演示服务')
  await page.getByTestId('admin-confirm-action').click()
  await expect(page.getByTestId('admin-confirm-action')).toHaveCount(0)
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
  expect(
    (await state(request)).logs.filter((l: { targetId: string }) => l.targetId === p.id),
  ).toHaveLength(1)
  await page.getByTestId('admin-tab-logs').click()
  await search(page, name)
  await expect(page.getByTestId('admin-log').filter({ hasText: '人工复核商品' })).toHaveCount(1)
})
