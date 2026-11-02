import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { startDemoServer } from '../scripts/demo-server.mjs'

const purchase = (id = 'star-fairy', price = 12800) => ({
  type: 'checkout',
  items: [{ productId: id, variant: 'standard', quantity: 1, expectedPrice: price }],
  recipient: { name: '管理验收用户', phone: '13800000001', address: '上海市 验收路1号' },
})
const product = {
  type: 'createProduct',
  title: '管理验收挂件',
  price: '29',
  stock: '2',
  cover: '/static/demo/star-fairy.jpg',
}
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'starisle-admin-'))
  const file = join(dir, 'data.json')
  let app = await startDemoServer({ dataFile: file, port: 0 })
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
  const admin = (await call('auth/login', { role: 'admin', username: 'admin', password: '123' }))
    .session
  const user = (
    await call('auth/login', { role: 'user', phone: '13800000000', password: '123456' })
  ).session
  const merchant = (
    await call('auth/login', { role: 'merchant', phone: '13800000000', password: '123456' })
  ).session
  return {
    call,
    admin,
    user,
    merchant,
    state: async () => (await call('admin/state', undefined, admin)).state,
    manage: (command, key = randomUUID()) =>
      call('admin/commands', command, admin, { 'X-Idempotency-Key': key }),
    register: async (phone = '13800000030') =>
      (
        await call('auth/register', {
          role: 'merchant',
          phone,
          password: '123456',
          qualificationCode: '1234',
          shopName: '审核中的小店',
        })
      ).session,
    read: async () => JSON.parse(await readFile(file, 'utf8')),
    restart: async () => {
      await app.close()
      app = await startDemoServer({ dataFile: file, port: 0 })
    },
  }
}

test('admin views require server administrator identity and never expose password digests or sessions', async (t) => {
  const a = await fixture(t)
  assert.equal((await a.call('admin/state')).status, 401)
  for (const session of [a.user, a.merchant]) {
    assert.equal(
      (await a.call('admin/state', undefined, session, { 'X-Demo-Role': 'admin' })).status,
      403,
    )
    assert.equal(
      (
        await a.call(
          'admin/commands',
          { type: 'setProductHidden', id: 'star-fairy', version: 0, hidden: true, reason: '测试' },
          session,
        )
      ).status,
      403,
    )
  }
  const state = await a.state()
  assert.equal(state.summary.activeShops, 1)
  assert.equal(state.summary.publishedProducts, 4)
  for (const account of state.accounts)
    for (const key of ['hash', 'salt', 'password', 'token', 'sessions'])
      assert.equal(account[key], undefined)
  assert.equal(state.auth, undefined)
  assert.equal(
    (
      await a.manage({
        type: 'setAccountDisabled',
        id: 'demo-admin',
        version: 0,
        disabled: true,
        reason: '测试',
      })
    ).status,
    403,
  )
  assert.equal((await a.state()).logs.length, 0)
})

test('new shops stay pending until approval; rejection, edit, resubmit and stale review are enforced', async (t) => {
  const a = await fixture(t)
  const merchant = await a.register()
  const id = merchant.account.shopId
  assert.equal((await a.call('state', undefined, merchant)).state.shop.status, 'PENDING')
  assert.equal((await a.call('commands', product, merchant)).status, 403)
  assert.equal((await a.call('commands', { type: 'reset' }, merchant)).status, 403)
  assert.equal(
    (await a.manage({ type: 'reviewShop', id, version: 0, decision: 'reject' })).status,
    400,
  )
  assert.equal(
    (
      await a.manage({
        type: 'reviewShop',
        id,
        version: 0,
        decision: 'reject',
        reason: '请补充店铺介绍',
      })
    ).status,
    200,
  )
  const rejected = (await a.call('state', undefined, merchant)).state.shop
  assert.equal(rejected.status, 'REJECTED')
  assert.equal(rejected.reason, '请补充店铺介绍')
  assert.equal(
    (
      await a.call(
        'commands',
        { type: 'editShop', name: '完善后的小店', description: '新的申请介绍' },
        merchant,
      )
    ).status,
    200,
  )
  assert.equal((await a.call('commands', { type: 'submitShopReview' }, merchant)).status, 200)
  assert.equal(
    (await a.manage({ type: 'reviewShop', id, version: 0, decision: 'approve' })).status,
    409,
  )
  const shop = (await a.state()).shops.find((s) => s.id === id)
  assert.equal(
    (
      await a.manage({
        type: 'reviewShop',
        id,
        version: shop.managementVersion,
        decision: 'approve',
      })
    ).status,
    200,
  )
  assert.equal((await a.call('commands', product, merchant)).status, 200)
  assert.equal((await a.call('commands', { type: 'submitShopReview' }, merchant)).status, 409)
  assert.deepEqual(
    (await a.state()).logs.map((l) => l.action),
    ['通过商家审核', '驳回商家审核'],
  )
})

test('account disabling revokes all roles, prevents new access, and restoration requires a fresh login', async (t) => {
  const a = await fixture(t)
  await a.call('commands', purchase(), a.user)
  const before = (await a.read()).marketplace.orders
  assert.equal(
    (
      await a.manage({
        type: 'setAccountDisabled',
        id: 'demo-user',
        version: 0,
        disabled: true,
        reason: '异常账号',
      })
    ).status,
    200,
  )
  for (const session of [a.user, a.merchant])
    assert.equal((await a.call('auth/session', undefined, session)).status, 401)
  assert.equal(
    (await a.call('auth/login', { role: 'user', phone: '13800000000', password: '123456' })).status,
    403,
  )
  assert.equal(
    (
      await a.call('auth/register', {
        role: 'merchant',
        phone: '13800000000',
        password: '123456',
        qualificationCode: '1234',
      })
    ).status,
    403,
  )
  const publicState = (await a.call('state')).state
  assert.equal(publicState.products.filter((p) => p.published).length, 0)
  assert.equal(publicState.shops.length, 0)
  assert.equal(
    (await a.manage({ type: 'setAccountDisabled', id: 'demo-user', version: 1, disabled: false }))
      .status,
    200,
  )
  assert.equal((await a.call('auth/session', undefined, a.user)).status, 401)
  assert.equal(
    (await a.call('auth/login', { role: 'user', phone: '13800000000', password: '123456' })).status,
    200,
  )
  assert.deepEqual((await a.read()).marketplace.orders, before)
  assert.equal((await a.call('state')).state.products.filter((p) => p.published).length, 4)
})

test('administrator product holds hide goods, block purchases and cannot be removed by merchant editing or reset', async (t) => {
  const a = await fixture(t)
  const paid = await a.call('commands', purchase(), a.user)
  const order = paid.state.orders[0]
  assert.equal(
    (
      await a.manage({
        type: 'setProductHidden',
        id: 'star-fairy',
        version: 0,
        hidden: true,
        reason: '商品介绍需核实',
      })
    ).status,
    200,
  )
  assert.equal(
    (await a.call('state')).state.products.find((p) => p.id === 'star-fairy').published,
    false,
  )
  assert.equal((await a.call('commands', purchase(), a.user)).status, 409)
  assert.equal(
    (await a.call('commands', { type: 'toggleProduct', id: 'star-fairy' }, a.merchant)).status,
    403,
  )
  assert.equal((await a.call('commands', { type: 'reset' }, a.merchant)).status, 403)
  assert.equal(
    (
      await a.call(
        'commands',
        { type: 'editProduct', id: 'star-fairy', title: '修改后的标题', price: '139' },
        a.merchant,
      )
    ).status,
    200,
  )
  const held = (await a.state()).products.find((p) => p.id === 'star-fairy')
  assert.equal(held.adminHidden, true)
  assert.equal(
    (
      await a.manage({
        type: 'setProductHidden',
        id: held.id,
        version: held.managementVersion,
        hidden: false,
      })
    ).status,
    200,
  )
  assert.equal(
    (await a.call('state')).state.products.find((p) => p.id === 'star-fairy').published,
    true,
  )
  assert.deepEqual((await a.state()).orders[0], order)
  await a.call('commands', { type: 'toggleProduct', id: 'star-fairy' }, a.merchant)
  const down = (await a.state()).products.find((p) => p.id === 'star-fairy')
  await a.manage({
    type: 'setProductHidden',
    id: down.id,
    version: down.managementVersion,
    hidden: true,
    reason: '再次复核',
  })
  const hidden = (await a.state()).products.find((p) => p.id === 'star-fairy')
  await a.manage({
    type: 'setProductHidden',
    id: hidden.id,
    version: hidden.managementVersion,
    hidden: false,
  })
  assert.equal(
    (await a.call('state')).state.products.find((p) => p.id === 'star-fairy').published,
    false,
  )
})

test('paused shops cannot sell or reset but can fulfil paid orders and resume without altering snapshots', async (t) => {
  const a = await fixture(t)
  const paid = await a.call('commands', purchase(), a.user)
  const order = paid.state.orders[0]
  assert.equal(
    (
      await a.manage({
        type: 'setShopSuspended',
        id: 'demo-shop',
        version: 0,
        suspended: true,
        reason: '暂停检查',
      })
    ).status,
    200,
  )
  assert.equal((await a.call('commands', product, a.merchant)).status, 403)
  assert.equal((await a.call('commands', { type: 'reset' }, a.merchant)).status, 403)
  assert.equal((await a.call('commands', purchase(), a.user)).status, 409)
  assert.equal((await a.call('state')).state.shops.length, 0)
  assert.equal(
    (
      await a.call(
        'commands',
        { type: 'ship', id: order.id, carrier: '顺丰', tracking: 'SF202611020001' },
        a.merchant,
      )
    ).status,
    200,
  )
  assert.equal((await a.call('commands', { type: 'receive', id: order.id }, a.user)).status, 200)
  assert.equal(
    (await a.manage({ type: 'setShopSuspended', id: 'demo-shop', version: 1, suspended: false }))
      .status,
    200,
  )
  const restored = (await a.state()).orders[0]
  assert.equal(restored.status, '已完成')
  assert.equal(restored.amount, order.amount)
  assert.deepEqual(restored.items, order.items)
  assert.equal((await a.call('state')).state.products.filter((p) => p.published).length, 4)
})

test('admin retries and logs persist across restart, and stale or invalid changes are atomic', async (t) => {
  const a = await fixture(t)
  const command = {
    type: 'setProductHidden',
    id: 'star-fairy',
    version: 0,
    hidden: true,
    reason: '核实图片',
  }
  const key = randomUUID()
  assert.equal((await a.manage({ ...command, reason: '' })).status, 400)
  assert.equal((await a.manage(command, key)).status, 200)
  await a.restart()
  assert.equal((await a.manage(command, key)).status, 200)
  assert.equal((await a.state()).logs.length, 1)
  assert.equal((await a.manage({ ...command, reason: '另一个原因' }, key)).status, 409)
  const before = await a.read()
  assert.equal(
    (await a.manage({ type: 'setProductHidden', id: 'star-fairy', version: 0, hidden: false }))
      .status,
    409,
  )
  assert.equal(
    (await a.manage({ type: 'changeOrder', id: 'missing', version: 0, amount: 1 })).status,
    400,
  )
  const after = await a.read()
  assert.deepEqual(after.marketplace, before.marketplace)
  assert.deepEqual(after.management, before.management)
  assert.equal(after.management.logs[0].actor, 'admin')
  assert.equal(after.management.logs[0].reason, '核实图片')
})
