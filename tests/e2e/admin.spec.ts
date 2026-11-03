import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { ADMIN_UI_ENABLED } from '../../packages/shared/src/features'

test.skip(!ADMIN_UI_ENABLED, '管理员界面暂时隐藏，后续启用时恢复验收')

const api = 'http://127.0.0.1:8787/api/demo'
const root = 'http://127.0.0.1:4173/#/'
async function credentials(page: Page, username = 'admin', password = '123') {
  await page.getByTestId('auth-username').locator('input').fill(username)
  await page.getByTestId('auth-password').locator('input').fill(password)
}
async function login(page: Page) {
  await page.goto(`${root}pages/auth/index?role=admin`)
  await credentials(page)
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('admin-workspace')).toBeVisible()
}
async function session(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('starisle.auth.session')!).data)
}

for (const port of [4173, 4174]) {
  test(`administrator login validates credentials, persists and logs out on build ${port}`, async ({
    page,
    request,
  }) => {
    const app = `http://127.0.0.1:${port}/#/`
    await page.goto(app)
    await page.getByTestId('role-admin').click()
    await expect(page.getByTestId('auth-submit')).toHaveText('登录管理员入口')
    await expect(page.getByTestId('auth-register')).toHaveCount(0)
    await expect(page.getByTestId('auth-browse')).toHaveCount(0)
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('auth-error')).toHaveText('请填写管理员账号')
    await credentials(page, 'admin', '')
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('auth-error')).toHaveText('请填写有效的管理员密码')
    await credentials(page, 'admin', 'wrong')
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('auth-error')).toHaveText('管理员账号或密码不正确')
    await credentials(page)
    await page.getByTestId('auth-login').click()
    await mkdir('.tools/previews', { recursive: true })
    for (const width of [375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: `.tools/previews/admin-login-${port}.png`, fullPage: true })
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('admin-username')).toHaveText('admin')
    const original = await session(page)
    expect(original.role).toBe('admin')
    expect(original.account.roles).toEqual(['admin'])
    await page.reload()
    await expect(page.getByTestId('admin-username')).toHaveText('admin')
    for (const width of [375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: `.tools/previews/admin-workspace-${port}.png`, fullPage: true })
    await page.goto(`${app}pages/index/index`)
    await expect(page).toHaveURL(/pages\/admin\/index/)
    await expect(page.getByTestId('admin-workspace')).toBeVisible()
    await page.getByTestId('admin-logout').click()
    await expect(page.getByTestId('auth-username')).toBeVisible()
    expect(
      (
        await request.get(`${api}/auth/session`, {
          headers: { Authorization: `Bearer ${original.token}` },
        })
      ).status(),
    ).toBe(401)
    await page.goto(`${app}pages/admin/index`)
    await expect(page.getByTestId('auth-username')).toBeVisible()
    await expect(page.getByTestId('admin-workspace')).toHaveCount(0)
    await credentials(page)
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('admin-username')).toHaveText('admin')
    await page.getByTestId('admin-logout').click()
    await expect(page.getByTestId('auth-username')).toBeVisible()
  })
}

test('admin routes reject guests, regular identities and forged local administrator roles', async ({
  page,
  request,
}) => {
  await page.goto(`${root}pages/admin/index`)
  await expect(page).toHaveURL(/pages\/auth\/index\?role=admin/)
  await expect(page.getByTestId('auth-username')).toBeVisible()
  for (const role of ['user', 'merchant']) {
    const response = await request.post(`${api}/auth/login`, {
      data: { role, phone: '13800000000', password: '123456' },
    })
    expect(response.ok()).toBe(true)
    const current = (await response.json()).session
    for (const forged of [false, true]) {
      const stored = forged
        ? { ...current, role: 'admin', account: { ...current.account, roles: ['admin'] } }
        : current
      await page.evaluate(
        (session) =>
          localStorage.setItem(
            'starisle.auth.session',
            JSON.stringify({ type: 'object', data: session }),
          ),
        stored,
      )
      await page.goto(`${root}pages/admin/index`)
      // A direct page load must validate the token after the local role was edited.
      await page.reload()
      await expect(page).toHaveURL(/pages\/auth\/index\?role=admin/)
      await expect(page.getByTestId('auth-username')).toBeVisible()
      await expect(page.getByTestId('admin-workspace')).toHaveCount(0)
    }
  }
})

test('revoked administrator sessions return to the administrator login', async ({
  page,
  request,
}) => {
  await login(page)
  const original = await session(page)
  expect(
    (
      await request.post(`${api}/auth/logout`, {
        headers: { Authorization: `Bearer ${original.token}` },
        data: {},
      })
    ).ok(),
  ).toBe(true)
  await page.reload()
  await expect(page.getByTestId('auth-username')).toBeVisible()
  await expect(page.getByTestId('admin-workspace')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('starisle.auth.session'))).toBeNull()
})

test('offline administrator login, verification and logout report errors and recover', async ({
  page,
}) => {
  await page.goto(`${root}pages/auth/index?role=admin`)
  await page.route('**/api/demo/auth/login', (route) => route.abort('failed'))
  await credentials(page)
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('auth-error')).toContainText('暂时无法连接演示服务')
  expect(await page.evaluate(() => localStorage.getItem('starisle.auth.session'))).toBeNull()
  await page.unroute('**/api/demo/auth/login')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('admin-workspace')).toBeVisible()
  await page.route('**/api/demo/auth/session', (route) => route.abort('failed'))
  await page.reload()
  await expect(page.getByTestId('admin-error')).toContainText('暂时无法连接演示服务')
  await expect(page.getByTestId('admin-workspace')).toHaveCount(0)
  await page.unroute('**/api/demo/auth/session')
  await page.getByTestId('admin-retry').click()
  await expect(page.getByTestId('admin-workspace')).toBeVisible()
  await page.route('**/api/demo/auth/logout', (route) => route.abort('failed'))
  await page.getByTestId('admin-logout').click()
  await expect(page.getByTestId('admin-error')).toContainText('暂时无法连接演示服务')
  await expect(page.getByTestId('admin-workspace')).toBeVisible()
  await page.unroute('**/api/demo/auth/logout')
  await page.getByTestId('admin-logout').click()
  await expect(page.getByTestId('auth-username')).toBeVisible()
})
