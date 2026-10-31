import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { startDemoServer } from '../scripts/demo-server.mjs'
import { orderItems } from '../packages/shared/src/demo-domain.ts'

const recipient = { name: '演示买家', phone: '13800000000', address: '上海市 演示路 1 号' }
function checkout(
  items = [{ productId: 'star-fairy', variant: 'standard', quantity: 1, expectedPrice: 12800 }],
) {
  return { type: 'checkout', items, recipient }
}
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'starisle-demo-'))
  const dataFile = join(dir, 'marketplace.json')
  let app = await startDemoServer({ dataFile, port: 0 })
  const tokens = {}
  for (const role of ['user', 'merchant']) {
    const response = await fetch(`${app.url}/api/demo/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, phone: '13800000000', password: '123456' }),
    })
    tokens[role] = (await response.json()).session.token
  }
  t.after(async () => {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  })
  return {
    async call(role, command, id = randomUUID(), extraHeaders = {}) {
      const response = await fetch(`${app.url}/api/demo/${command ? 'commands' : 'state'}`, {
        method: command ? 'POST' : 'GET',
        headers: {
          'X-Demo-Role': role,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': id,
          Authorization: `Bearer ${tokens[role]}`,
          ...extraHeaders,
        },
        body: command ? JSON.stringify(command) : undefined,
      })
      return { status: response.status, ...(await response.json()) }
    },
    async restart() {
      await app.close()
      app = await startDemoServer({ dataFile, port: 0 })
    },
  }
}

test('one shared order flows from payment through shipment to receipt, retaining snapshots', async (t) => {
  const app = await fixture(t)
  const paid = await app.call(
    'user',
    checkout([{ productId: 'star-fairy', variant: 'gift', quantity: 2, expectedPrice: 15800 }]),
  )
  assert.equal(paid.status, 200)
  const order = paid.state.orders[0]
  assert.equal(order.amount, 31600)
  assert.equal(order.status, '待发货')
  assert.equal(order.shopName, '星屿周边馆')
  assert.deepEqual(order.recipient, recipient)
  assert.equal(paid.state.products[0].stock, 34)
  assert.equal(paid.state.products[0].sold, 130)
  assert.equal((await app.call('user', { type: 'receive', id: order.id })).status, 409)
  await app.call('merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '改名后的手办',
    price: '139',
    stock: '34',
  })
  await app.call('merchant', {
    type: 'editShop',
    name: '改名后的小店',
    description: '新的店铺介绍',
  })
  const merchant = await app.call('merchant')
  assert.equal(merchant.state.orders[0].id, order.id)
  assert.equal(merchant.state.orders[0].title, '星之花旅人 · 樱粉手办')
  assert.equal(merchant.state.orders[0].amount, 31600)
  assert.equal(merchant.state.orders[0].shopName, '星屿周边馆')
  assert.equal(
    (await app.call('merchant', { type: 'ship', id: order.id, carrier: '顺丰速运', tracking: '' }))
      .status,
    400,
  )
  assert.equal(
    (
      await app.call('merchant', {
        type: 'ship',
        id: order.id,
        carrier: '顺丰速运',
        tracking: 'SF1234567890',
      })
    ).status,
    200,
  )
  const shipped = await app.call('user')
  assert.equal(shipped.state.orders[0].tracking, 'SF1234567890')
  assert.equal(shipped.state.orders[0].status, '待收货')
  assert.equal((await app.call('user', { type: 'receive', id: order.id })).status, 200)
  assert.equal((await app.call('merchant')).state.orders[0].status, '已完成')
  assert.equal(
    (
      await app.call('merchant', {
        type: 'ship',
        id: order.id,
        carrier: '顺丰',
        tracking: 'SF1234567890',
      })
    ).status,
    409,
  )
})

test('concurrent payments cannot oversell the last unit', async (t) => {
  const app = await fixture(t)
  await app.call('merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '限量手办',
    price: '128',
    stock: '1',
  })
  const results = await Promise.all([app.call('user', checkout()), app.call('user', checkout())])
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409])
  const saved = await app.call('merchant')
  assert.equal(saved.state.products[0].stock, 0)
  assert.equal(saved.state.orders.length, 1)
})

test('cart quantities are validated together and invalid carts do not partially commit', async (t) => {
  const app = await fixture(t)
  const result = await app.call(
    'user',
    checkout([
      { productId: 'star-fairy', variant: 'standard', quantity: 20, expectedPrice: 12800 },
      { productId: 'star-fairy', variant: 'gift', quantity: 20, expectedPrice: 15800 },
      { productId: 'island-card', variant: 'standard', quantity: 1, expectedPrice: 1800 },
    ]),
  )
  assert.equal(result.status, 409)
  const saved = await app.call('merchant')
  assert.equal(saved.state.products[0].stock, 36)
  assert.equal(saved.state.orders.length, 0)
  assert.equal(
    (
      await app.call(
        'user',
        checkout([
          { productId: 'star-fairy', variant: 'standard', quantity: -1, expectedPrice: 12800 },
        ]),
      )
    ).status,
    400,
  )
})

test('idempotent retries survive service restart and do not deduct stock twice', async (t) => {
  const app = await fixture(t)
  const id = randomUUID()
  const [first, duplicate] = await Promise.all([
    app.call('user', checkout(), id),
    app.call('user', checkout(), id),
  ])
  assert.equal(first.status, 200)
  assert.deepEqual(first.orderIds, duplicate.orderIds)
  await app.restart()
  const recovered = await app.call('user', checkout(), id)
  assert.deepEqual(recovered.orderIds, first.orderIds)
  assert.equal(recovered.state.orders.length, 1)
  assert.equal(recovered.state.products[0].stock, 35)
  assert.equal(
    (
      await app.call(
        'user',
        checkout([{ productId: 'star-fairy', variant: 'gift', quantity: 1, expectedPrice: 15800 }]),
        id,
      )
    ).status,
    409,
  )
})

test('server rejects stale prices, unpublished goods, invalid addresses and incorrect roles', async (t) => {
  const app = await fixture(t)
  assert.equal(
    (await app.call('user', { type: 'editShop', name: '冒用商家', description: '演示' })).status,
    403,
  )
  assert.equal((await app.call('merchant', checkout())).status, 403)
  assert.equal(
    (await app.call('user', { ...checkout(), recipient: { ...recipient, phone: '123' } })).status,
    400,
  )
  await app.call('merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '星之花旅人',
    price: '139',
    stock: '36',
  })
  assert.equal((await app.call('user', checkout())).status, 409)
  await app.call('merchant', { type: 'toggleProduct', id: 'star-fairy' })
  assert.equal(
    (
      await app.call(
        'user',
        checkout([
          { productId: 'star-fairy', variant: 'standard', quantity: 1, expectedPrice: 13900 },
        ]),
      )
    ).status,
    409,
  )
  assert.equal((await app.call('merchant')).state.orders.length, 0)
  assert.equal(
    (await app.call('user', undefined, randomUUID(), { Origin: 'https://example.org' })).status,
    403,
  )
})

test('merchant publication, shared reset and revisions persist across restarts', async (t) => {
  const app = await fixture(t)
  const created = await app.call('merchant', {
    type: 'createProduct',
    title: '联动新品',
    price: '29.90',
    stock: '3',
    cover: '/static/demo/star-fairy.jpg',
  })
  assert.equal(created.status, 200)
  assert.equal((await app.call('user')).state.products[0].title, '联动新品')
  const paymentId = randomUUID()
  const paid = await app.call('user', checkout(), paymentId)
  const reset = await app.call('merchant', { type: 'reset' })
  assert.equal(reset.state.orders.length, 0)
  assert.equal(reset.state.products.length, 4)
  assert.ok(reset.state.revision > created.state.revision)
  assert.equal((await app.call('user', checkout(), paymentId)).status, 409)
  assert.equal(
    (await app.call('user', { ...checkout(), datasetId: paid.state.datasetId })).status,
    409,
  )
  await app.restart()
  const saved = await app.call('user')
  assert.equal(saved.state.orders.length, 0)
  assert.equal(saved.state.revision, reset.state.revision)
})

test('one remaining unit rejects two units of the same product, including mixed variants', async (t) => {
  const app = await fixture(t)
  await app.call('merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '最后一件手办',
    price: '128',
    stock: '1',
  })
  for (const items of [
    [{ productId: 'star-fairy', variant: 'standard', quantity: 2, expectedPrice: 12800 }],
    [
      { productId: 'star-fairy', variant: 'standard', quantity: 1, expectedPrice: 12800 },
      { productId: 'star-fairy', variant: 'gift', quantity: 1, expectedPrice: 15800 },
    ],
  ]) {
    const rejected = await app.call('user', checkout(items))
    assert.equal(rejected.status, 409)
    assert.match(rejected.message, /库存不足，仅剩 1 件/)
    assert.equal(rejected.state.products[0].stock, 1)
    assert.equal(rejected.state.orders.length, 0)
  }
  const paid = await app.call('user', checkout())
  assert.equal(paid.status, 200)
  assert.equal(paid.state.products[0].stock, 0)
  assert.equal((await app.call('user', checkout())).status, 409)
  const saved = await app.call('merchant')
  assert.equal(saved.state.products[0].stock, 0)
  assert.equal(saved.state.orders.length, 1)
  assert.equal(saved.state.orders[0].quantity, 1)
})

test('editing price preserves sales stock and stale inventory edits cannot partially save', async (t) => {
  const app = await fixture(t)
  await app.call('merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '限量手办',
    price: '128',
    stock: '2',
  })
  await app.call('user', checkout())
  const edited = await app.call('merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '改价手办',
    price: '139',
  })
  assert.equal(edited.status, 200)
  assert.equal(edited.state.products[0].stock, 1)
  assert.equal(edited.state.products[0].sold, 129)
  const conflict = await app.call('merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '不应保存的名称',
    price: '149',
    stock: '5',
    expectedStock: 2,
  })
  assert.equal(conflict.status, 409)
  assert.match(conflict.message, /库存已变化/)
  assert.equal(conflict.state.products[0].stock, 1)
  assert.equal(conflict.state.products[0].price, 13900)
  assert.equal(conflict.state.products[0].title, '改价手办')
  const restocked = await app.call('merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '改价手办',
    price: '139',
    stock: '5',
    expectedStock: 1,
  })
  assert.equal(restocked.status, 200)
  assert.equal(restocked.state.products[0].stock, 5)
  assert.equal(restocked.state.orders.length, 1)
  assert.equal(restocked.state.orders[0].amount, 12800)
})

test('stock remains validated when optional edits omit it or supply an invalid value', async (t) => {
  const app = await fixture(t)
  for (const stock of ['', '-1', '1.5', null, 2]) {
    const invalid = await app.call('merchant', {
      type: 'editProduct',
      id: 'star-fairy',
      title: '测试手办',
      price: '128',
      stock,
    })
    assert.equal(invalid.status, 400)
  }
  const invalidBaseline = await app.call('merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '测试手办',
    price: '128',
    stock: '5',
    expectedStock: '36',
  })
  assert.equal(invalidBaseline.status, 400)
  const missingStock = await app.call('merchant', {
    type: 'createProduct',
    title: '新品',
    price: '29',
    cover: '/static/demo/star-fairy.jpg',
  })
  assert.equal(missingStock.status, 400)
  const saved = await app.call('user')
  assert.equal(saved.state.products[0].stock, 36)
  assert.equal(saved.state.products.length, 4)
})

test('checkout combines same-shop products and variants into one immutable order', async (t) => {
  const app = await fixture(t)
  const paid = await app.call(
    'user',
    checkout([
      { productId: 'star-fairy', variant: 'standard', quantity: 2, expectedPrice: 12800 },
      { productId: 'star-fairy', variant: 'gift', quantity: 1, expectedPrice: 15800 },
      { productId: 'island-card', variant: 'standard', quantity: 3, expectedPrice: 1800 },
    ]),
  )
  assert.equal(paid.status, 200)
  assert.equal(paid.orderIds.length, 1)
  const order = paid.state.orders[0]
  assert.equal(order.quantity, 6)
  assert.equal(order.amount, 46800)
  assert.equal(order.items.length, 3)
  assert.deepEqual(
    order.items.map((item) => [item.variant, item.quantity, item.unitPrice, item.amount]),
    [
      ['标准版', 2, 12800, 25600],
      ['礼盒版', 1, 15800, 15800],
      ['标准版', 3, 1800, 5400],
    ],
  )
  assert.equal(paid.state.products.find((product) => product.id === 'star-fairy').stock, 33)
  assert.equal(paid.state.products.find((product) => product.id === 'island-card').stock, 117)
  await app.call('merchant', {
    type: 'editProduct',
    id: 'star-fairy',
    title: '后来改名',
    price: '199',
  })
  const saved = (await app.call('user')).state.orders[0]
  assert.deepEqual(saved.items, order.items)
  assert.deepEqual(saved.recipient, recipient)
  await app.call('merchant', {
    type: 'ship',
    id: order.id,
    carrier: '顺丰',
    tracking: 'SF1234567890',
  })
  assert.equal((await app.call('user', { type: 'receive', id: order.id })).status, 200)
  assert.equal((await app.call('user')).state.orders[0].status, '已完成')
})

test('duplicate checkout lines merge without losing quantity or stock deduction', async (t) => {
  const app = await fixture(t)
  const paid = await app.call(
    'user',
    checkout([
      { productId: 'star-fairy', variant: 'standard', quantity: 1, expectedPrice: 12800 },
      { productId: 'star-fairy', variant: 'standard', quantity: 2, expectedPrice: 12800 },
    ]),
  )
  assert.equal(paid.status, 200)
  assert.equal(paid.state.orders.length, 1)
  assert.equal(paid.state.orders[0].items.length, 1)
  assert.equal(paid.state.orders[0].items[0].quantity, 3)
  assert.equal(paid.state.orders[0].amount, 38400)
  assert.equal(paid.state.products[0].stock, 33)
})

test('legacy single-product orders keep their original item snapshot without mutation', () => {
  const order = {
    productId: 'old-product',
    title: '旧商品',
    cover: 'old.jpg',
    variant: '礼盒版',
    quantity: 2,
    amount: 31600,
  }
  const original = structuredClone(order)
  assert.deepEqual(orderItems(order), [{ ...original, unitPrice: 15800 }])
  assert.deepEqual(order, original)
})
