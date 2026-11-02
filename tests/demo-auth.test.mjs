import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { startDemoServer } from '../scripts/demo-server.mjs'
import { createDemoMarketplace } from '../packages/shared/src/demo-domain.ts'

async function fixture(t, legacy = false) {
  const dir = await mkdtemp(join(tmpdir(), 'starisle-auth-'))
  const dataFile = join(dir, 'data.json')
  if (legacy) {
    const marketplace = createDemoMarketplace(randomUUID())
    marketplace.orders.push({
      id: 'legacy-order',
      buyerId: 'demo-user',
      title: '保留的旧订单',
      status: '已完成',
    })
    await writeFile(
      dataFile,
      JSON.stringify({
        schema: 1,
        marketplace,
        receipts: {
          'user:legacy-operation': {
            fingerprint: '{}',
            orderIds: ['legacy-order'],
            datasetId: marketplace.datasetId,
          },
        },
      }),
    )
  }
  let app = await startDemoServer({ dataFile, port: 0 })
  t.after(async () => {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  })
  async function call(path, data, session, headers = {}) {
    const response = await fetch(`${app.url}/api/demo/${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Role': session?.role || 'user',
        'X-Idempotency-Key': randomUUID(),
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        ...headers,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
    return { status: response.status, ...(await response.json()) }
  }
  return {
    call,
    // Trading regressions use an approved shop; pending/rejected flows have dedicated admin tests.
    register: async (phone, role = 'user', password = '123456') => {
      const result = await call('auth/register', {
        role,
        phone,
        password,
        ...(role === 'merchant' ? { qualificationCode: '1234' } : {}),
      })
      if (result.status === 200 && role === 'merchant') {
        const admin = (
          await call('auth/login', { role: 'admin', username: 'admin', password: '123' })
        ).session
        const state = (await call('admin/state', undefined, admin)).state
        const shop = state.shops.find((shop) => shop.id === result.session.account.shopId)
        assert.equal(
          (
            await call(
              'admin/commands',
              {
                type: 'reviewShop',
                id: shop.id,
                version: shop.managementVersion,
                decision: 'approve',
              },
              admin,
            )
          ).status,
          200,
        )
      }
      return result
    },
    login: (phone = '13800000000', role = 'user', password = '123456') =>
      call('auth/login', { role, phone, password }),
    read: async () => JSON.parse(await readFile(dataFile, 'utf8')),
    write: async (store) => writeFile(dataFile, JSON.stringify(store)),
    restart: async () => {
      await app.close()
      app = await startDemoServer({ dataFile, port: 0 })
    },
  }
}
const checkout = {
  type: 'checkout',
  items: [{ productId: 'star-fairy', variant: 'standard', quantity: 1, expectedPrice: 12800 }],
  recipient: { name: '测试收货人', phone: '13800000001', address: '上海市 演示路 1 号' },
}

test('registration validates phone and minimum password, blocks inactive roles and duplicates, and hashes passwords', async (t) => {
  const app = await fixture(t)
  for (const phone of ['123', '23800000000', '', null])
    assert.equal((await app.register(phone)).status, 400)
  assert.equal((await app.register('13800000001', 'user', '12345')).status, 400)
  assert.equal((await app.register('13800000001', 'artist')).status, 403)
  assert.equal((await app.register('13800000001', 'event')).status, 403)
  const registered = await app.register('13800000001', 'user', 'abcdef')
  assert.equal(registered.status, 200)
  assert.equal(registered.session.account.phone, '13800000001')
  assert.equal(registered.session.account.hash, undefined)
  assert.equal((await app.register('13800000001', 'user', 'abcdef')).status, 409)
  assert.equal((await app.login('13800000001', 'user', 'badpass')).status, 401)
  const saved = await app.read()
  assert.ok(!JSON.stringify(saved).includes('abcdef'))
  assert.equal(saved.auth.accounts.length, 3)
})

test('a shared phone can open another role with the original password and cannot acquire disabled roles', async (t) => {
  const app = await fixture(t)
  const user = (await app.register('13800000002')).session
  assert.equal((await app.login('13800000002', 'merchant')).status, 403)
  assert.equal((await app.register('13800000002', 'merchant', 'badpass')).status, 409)
  const merchant = (await app.register('13800000002', 'merchant')).session
  assert.equal(user.account.id, merchant.account.id)
  assert.deepEqual(merchant.account.roles, ['user', 'merchant'])
  assert.equal(
    (await app.call('commands', { type: 'reset' }, user, { 'X-Demo-Role': 'merchant' })).status,
    403,
  )
  const shop = await app.call('state', undefined, merchant)
  assert.equal(shop.state.products.length, 0)
  assert.equal(shop.state.orders.length, 0)
})

test('guests can see the catalog but cannot read merchant data or create orders', async (t) => {
  const app = await fixture(t)
  const user = (await app.login()).session
  await app.call('commands', checkout, user)
  const guest = await app.call('state')
  assert.equal(guest.status, 200)
  assert.equal(guest.state.products.length, 4)
  assert.deepEqual(guest.state.orders, [])
  assert.equal(
    (await app.call('state', undefined, undefined, { 'X-Demo-Role': 'merchant' })).status,
    401,
  )
  assert.equal((await app.call('commands', checkout)).status, 401)
  assert.equal(
    (await app.call('state', undefined, undefined, { Authorization: 'Bearer fake-token' })).status,
    401,
  )
})

test('orders, receipt permission and idempotency receipts are isolated between users', async (t) => {
  const app = await fixture(t)
  const a = (await app.register('13800000003')).session
  const b = (await app.register('13800000004')).session
  const operationId = randomUUID()
  const paidA = await app.call('commands', checkout, a, { 'X-Idempotency-Key': operationId })
  const paidB = await app.call('commands', checkout, b, { 'X-Idempotency-Key': operationId })
  assert.notEqual(paidA.orderIds[0], paidB.orderIds[0])
  assert.deepEqual(
    (await app.call('state', undefined, a)).state.orders.map((o) => o.id),
    paidA.orderIds,
  )
  assert.deepEqual(
    (await app.call('state', undefined, b)).state.orders.map((o) => o.id),
    paidB.orderIds,
  )
  const merchant = (await app.login('13800000000', 'merchant')).session
  await app.call(
    'commands',
    { type: 'ship', id: paidA.orderIds[0], carrier: '顺丰速运', tracking: 'SF1234567890' },
    merchant,
  )
  assert.equal(
    (await app.call('commands', { type: 'receive', id: paidA.orderIds[0] }, b)).status,
    403,
  )
  assert.equal(
    (await app.call('commands', { type: 'receive', id: paidA.orderIds[0] }, a)).status,
    200,
  )
})

test('merchant data, writes and resets are scoped to the registered shop', async (t) => {
  const app = await fixture(t)
  const merchant = (await app.register('13800000005', 'merchant')).session
  const other = (await app.register('13800000006', 'merchant')).session
  const user = (await app.register('13800000007')).session
  const product = await app.call(
    'commands',
    {
      type: 'createProduct',
      title: '新店挂件',
      price: '29',
      stock: '2',
      cover: '/static/demo/star-fairy.jpg',
    },
    merchant,
  )
  const id = product.state.products[0].id
  const paid = await app.call(
    'commands',
    {
      ...checkout,
      items: [{ productId: id, variant: 'standard', quantity: 1, expectedPrice: 2900 }],
    },
    user,
  )
  assert.equal(paid.state.orders[0].shopName, '星屿小店0005')
  assert.equal((await app.call('state', undefined, other)).state.orders.length, 0)
  assert.equal((await app.call('state', undefined, other)).state.products.length, 0)
  assert.equal((await app.call('commands', { type: 'toggleProduct', id }, other)).status, 403)
  assert.equal(
    (await app.call('commands', { type: 'editProduct', id, title: '非法改名', price: '39' }, other))
      .status,
    403,
  )
  assert.equal(
    (
      await app.call(
        'commands',
        { type: 'ship', id: paid.orderIds[0], carrier: '顺丰', tracking: 'SF1234567890' },
        other,
      )
    ).status,
    403,
  )
  await app.call('commands', { type: 'reset' }, other)
  assert.equal((await app.call('state', undefined, merchant)).state.orders.length, 1)
  assert.equal((await app.call('state', undefined, merchant)).state.products[0].stock, 1)
})

test('accounts and sessions survive restart, logout revokes the token, and failed role registration is atomic', async (t) => {
  const app = await fixture(t)
  const user = (await app.register('13800000008')).session
  const rejected = await app.call('auth/register', {
    phone: '13800000008',
    password: '123456',
    role: 'merchant',
    shopName: '名'.repeat(31),
    qualificationCode: '1234',
  })
  assert.equal(rejected.status, 400)
  assert.equal((await app.login('13800000008', 'merchant')).status, 403)
  await app.restart()
  assert.equal((await app.call('state', undefined, user)).status, 200)
  assert.equal((await app.login('13800000008')).status, 200)
  await app.call('auth/logout', {}, user)
  assert.equal((await app.call('state', undefined, user)).status, 401)
})

test('legacy demo data and idempotency receipts migrate without losing the old orders', async (t) => {
  const app = await fixture(t, true)
  const user = (await app.login()).session
  assert.equal((await app.call('state', undefined, user)).state.orders[0].id, 'legacy-order')
  const saved = await app.read()
  assert.ok(saved.receipts['demo-user:user:legacy-operation'])
  assert.equal(saved.marketplace.products.length, 4)
  assert.equal(saved.marketplace.orders[0].status, '已完成')
})

test('merchant registration requires the simulated qualification code before creating or upgrading an account', async (t) => {
  const app = await fixture(t)
  const merchantForm = { phone: '13800000009', password: '123456', role: 'merchant' }
  for (const qualificationCode of [undefined, '', '0000', 1234, '12345']) {
    const result = await app.call('auth/register', { ...merchantForm, qualificationCode })
    assert.equal(result.status, 400)
    assert.match(result.message, /资质验证码/)
  }
  assert.equal((await app.read()).auth.accounts.length, 2)
  const merchant = await app.call('auth/register', { ...merchantForm, qualificationCode: '1234' })
  assert.equal(merchant.status, 200)
  assert.deepEqual(merchant.session.account.roles, ['merchant'])
  assert.equal((await app.login('13800000009', 'merchant')).status, 200)
  const user = await app.register('13800000009')
  assert.equal(user.status, 200)
  assert.equal(user.session.account.id, merchant.session.account.id)
  assert.deepEqual(user.session.account.roles, ['merchant', 'user'])

  const existing = (await app.register('13800000010')).session
  for (const qualificationCode of [undefined, '0000']) {
    const rejected = await app.call('auth/register', {
      phone: '13800000010',
      password: '123456',
      role: 'merchant',
      qualificationCode,
    })
    assert.equal(rejected.status, 400)
    assert.equal((await app.login('13800000010', 'merchant')).status, 403)
    const account = (await app.read()).auth.accounts.find(
      (account) => account.id === existing.account.id,
    )
    assert.deepEqual(account.roles, ['user'])
    assert.equal(account.shopId, undefined)
  }
  const upgraded = await app.register('13800000010', 'merchant')
  assert.equal(upgraded.status, 200)
  assert.equal(upgraded.session.account.id, existing.account.id)
  assert.deepEqual(upgraded.session.account.roles, ['user', 'merchant'])
})

test('multi-shop checkout is atomic, splits one order per shop and keeps shipping scoped', async (t) => {
  const app = await fixture(t)
  const buyer = (await app.register('13800000011')).session
  const merchant = (await app.register('13800000012', 'merchant')).session
  const originalShop = (await app.login('13800000000', 'merchant')).session
  const created = await app.call(
    'commands',
    {
      type: 'createProduct',
      title: '跨店徽章',
      price: '29',
      stock: '2',
      cover: '/static/demo/star-fairy.jpg',
    },
    merchant,
  )
  const id = created.state.products[0].id
  const items = [
    { productId: 'star-fairy', variant: 'standard', quantity: 1, expectedPrice: 12800 },
    { productId: 'island-card', variant: 'standard', quantity: 2, expectedPrice: 1800 },
    { productId: id, variant: 'standard', quantity: 3, expectedPrice: 2900 },
  ]
  const rejected = await app.call('commands', { ...checkout, items }, buyer)
  assert.equal(rejected.status, 409)
  assert.equal(rejected.state.orders.length, 0)
  assert.equal(rejected.state.products.find((product) => product.id === 'star-fairy').stock, 36)
  assert.equal(rejected.state.products.find((product) => product.id === id).stock, 2)
  items[2].quantity = 1
  const operationId = randomUUID()
  const paid = await app.call('commands', { ...checkout, items }, buyer, {
    'X-Idempotency-Key': operationId,
  })
  assert.equal(paid.status, 200)
  assert.equal(paid.orderIds.length, 2)
  assert.equal(
    paid.state.orders.reduce((sum, order) => sum + order.amount, 0),
    19300,
  )
  const originalOrder = paid.state.orders.find((order) => order.shopId === 'demo-shop')
  const newOrder = paid.state.orders.find((order) => order.shopId === merchant.account.shopId)
  assert.equal(originalOrder.items.length, 2)
  assert.equal(originalOrder.quantity, 3)
  assert.equal(originalOrder.amount, 16400)
  assert.equal(newOrder.amount, 2900)
  assert.equal((await app.call('state', undefined, merchant)).state.orders.length, 1)
  assert.equal((await app.call('state', undefined, originalShop)).state.orders.length, 1)
  assert.equal(
    (
      await app.call(
        'commands',
        { type: 'ship', id: originalOrder.id, carrier: '顺丰', tracking: 'SF1234567890' },
        merchant,
      )
    ).status,
    403,
  )
  await app.call(
    'commands',
    { type: 'ship', id: newOrder.id, carrier: '顺丰', tracking: 'SF1234567890' },
    merchant,
  )
  assert.equal(
    (await app.call('state', undefined, buyer)).state.orders.find(
      (order) => order.id === originalOrder.id,
    ).status,
    '待发货',
  )
  const retry = await app.call('commands', { ...checkout, items }, buyer, {
    'X-Idempotency-Key': operationId,
  })
  assert.deepEqual(retry.orderIds, paid.orderIds)
  assert.equal(retry.state.orders.length, 2)
  assert.equal(retry.state.products.find((product) => product.id === id).stock, 1)
})

test('preset administrator accepts admin / 123, rejects wrong credentials and keeps a salted digest', async (t) => {
  const app = await fixture(t)
  for (const credentials of [
    { username: 'admin', password: 'wrong' },
    { username: 'other', password: '123' },
  ])
    assert.equal((await app.call('auth/login', { role: 'admin', ...credentials })).status, 401)
  assert.equal((await app.call('auth/login', { role: 'admin', password: '123' })).status, 400)
  const response = await app.call('auth/login', {
    role: 'admin',
    username: ' admin ',
    password: '123',
  })
  assert.equal(response.status, 200)
  assert.equal(response.session.account.username, 'admin')
  assert.equal(response.session.role, 'admin')
  assert.deepEqual(response.session.account.roles, ['admin'])
  assert.equal(response.session.account.hash, undefined)
  assert.equal(response.session.account.salt, undefined)
  const account = (await app.read()).auth.accounts.find((account) => account.id === 'demo-admin')
  assert.equal(account.password, undefined)
  assert.equal(account.salt.length, 32)
  assert.equal(account.hash.length, 64)
  for (const role of ['user', 'merchant'])
    assert.equal((await app.register('13800000020', role, '123')).status, 400)
})

test('administrator registration and trading are denied and regular identities cannot become administrators', async (t) => {
  const app = await fixture(t)
  const admin = (
    await app.call('auth/login', { role: 'admin', username: 'admin', password: '123' })
  ).session
  const user = (await app.login()).session
  const merchant = (await app.login('13800000000', 'merchant')).session
  const before = await app.read()
  assert.equal(
    (await app.call('auth/register', { role: 'admin', username: 'admin', password: '123' })).status,
    403,
  )
  assert.equal((await app.register('13800000000', 'admin')).status, 403)
  for (const session of [user, merchant]) {
    const current = await app.call('auth/session', undefined, session)
    assert.equal(current.status, 200)
    assert.equal(current.session.role, session.role)
    assert.ok(!current.session.account.roles.includes('admin'))
    assert.equal(
      (await app.call('commands', { type: 'reset' }, session, { 'X-Demo-Role': 'admin' })).status,
      403,
    )
  }
  assert.equal((await app.call('commands', checkout, admin)).status, 403)
  assert.equal(
    (await app.call('commands', { type: 'reset' }, admin, { 'X-Demo-Role': 'merchant' })).status,
    403,
  )
  assert.equal((await app.call('state', undefined, admin)).status, 400)
  assert.equal((await app.call('state', undefined, admin, { 'X-Demo-Role': 'user' })).status, 403)
  const after = await app.read()
  assert.deepEqual(after.marketplace, before.marketplace)
  assert.deepEqual(after.receipts, before.receipts)
  assert.deepEqual(after.auth.accounts, before.auth.accounts)
})

test('administrator sessions survive restarts while revoked, expired and invalid sessions fail verification', async (t) => {
  const app = await fixture(t)
  const credentials = { role: 'admin', username: 'admin', password: '123' }
  const admin = (await app.call('auth/login', credentials)).session
  await app.restart()
  assert.deepEqual((await app.call('auth/session', undefined, admin)).session, admin)
  assert.equal((await app.call('auth/session')).status, 401)
  assert.equal(
    (await app.call('auth/session', undefined, { role: 'admin', token: 'fake-token' })).status,
    401,
  )
  await app.call('auth/logout', {}, admin)
  assert.equal((await app.call('auth/session', undefined, admin)).status, 401)
  const expired = (await app.call('auth/login', credentials)).session
  const saved = await app.read()
  saved.auth.sessions[expired.token].expiresAt = Date.now() - 1
  await app.write(saved)
  await app.restart()
  assert.equal((await app.call('auth/session', undefined, expired)).status, 401)
})

test('existing stores gain a single administrator without changing accounts, sessions, orders or retry receipts', async (t) => {
  const app = await fixture(t)
  const user = (await app.register('13800000021')).session
  const operationId = randomUUID()
  const paid = await app.call('commands', checkout, user, { 'X-Idempotency-Key': operationId })
  const existing = await app.read()
  existing.auth.accounts = existing.auth.accounts.filter((account) => account.id !== 'demo-admin')
  await app.write(existing)
  await app.restart()
  const upgraded = await app.read()
  assert.deepEqual(upgraded.marketplace, existing.marketplace)
  assert.deepEqual(upgraded.receipts, existing.receipts)
  assert.deepEqual(upgraded.auth.sessions, existing.auth.sessions)
  assert.deepEqual(
    upgraded.auth.accounts.filter((account) => account.id !== 'demo-admin'),
    existing.auth.accounts,
  )
  assert.equal(
    (await app.call('auth/login', { role: 'admin', username: 'admin', password: '123' })).status,
    200,
  )
  const admin = (await app.read()).auth.accounts.find((account) => account.id === 'demo-admin')
  await app.restart()
  const restarted = await app.read()
  assert.equal(restarted.auth.accounts.filter((account) => account.id === 'demo-admin').length, 1)
  assert.deepEqual(
    restarted.auth.accounts.find((account) => account.id === 'demo-admin'),
    admin,
  )
  const retry = await app.call('commands', checkout, user, { 'X-Idempotency-Key': operationId })
  assert.deepEqual(retry.orderIds, paid.orderIds)
  assert.equal(retry.state.orders.length, 1)
  assert.equal(retry.state.products[0].stock, 35)
})
