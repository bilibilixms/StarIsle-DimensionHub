import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { startDemoServer } from '../scripts/demo-server.mjs'
import { reviewItemKey, orderItems } from '../packages/shared/src/demo-domain.ts'
const recipient = { name: '评价买家', phone: '13800000000', address: '上海市 测试路 8 号' }
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'starisle-reviews-'))
  const dataFile = join(dir, 'marketplace.json')
  let app = await startDemoServer({ dataFile, port: 0 })
  const tokens = {}
  t.after(async () => {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  })
  async function call(role, path, data, key = randomUUID()) {
    const response = await fetch(`${app.url}/api/demo/${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Role': role === 'merchant' || role === 'otherMerchant' ? 'merchant' : 'user',
        'X-Idempotency-Key': key,
        ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
    return { status: response.status, ...(await response.json()) }
  }
  for (const role of ['user', 'merchant']) {
    const logged = await call('guest', 'auth/login', {
      role,
      phone: '13800000000',
      password: '123456',
    })
    tokens[role] = logged.session.token
  }
  return {
    call,
    command: (role, data, key) => call(role, 'commands', data, key),
    register: async (alias, role, phone) => {
      const response = await call('guest', 'auth/register', {
        role,
        phone,
        password: '123456',
        qualificationCode: '1234',
      })
      tokens[alias] = response.session.token
    },
    restart: async () => {
      await app.close()
      app = await startDemoServer({ dataFile, port: 0 })
    },
  }
}
async function purchase(
  app,
  items = [{ productId: 'star-fairy', variant: 'standard', quantity: 1, expectedPrice: 12800 }],
) {
  const response = await app.command('user', { type: 'checkout', items, recipient })
  assert.equal(response.status, 200)
  return response.state.orders[0]
}
async function complete(app, id) {
  assert.equal(
    (await app.command('merchant', { type: 'ship', id, carrier: '顺丰', tracking: 'SF12345678' }))
      .status,
    200,
  )
  assert.equal((await app.command('user', { type: 'receive', id })).status, 200)
}
function review(order, fields = {}) {
  return {
    type: 'submitReview',
    orderId: order.id,
    itemKey: reviewItemKey(orderItems(order)[0]),
    rating: 4,
    content: '实物做工不错，包装完好。',
    images: [],
    ...fields,
  }
}
const imageData = async () =>
  (
    await sharp({ create: { width: 16, height: 16, channels: 3, background: '#8b5cf6' } })
      .png()
      .toBuffer()
  ).toString('base64')

test('only completed-order buyers can review, and duplicate or invalid submissions are rejected', async (t) => {
  const app = await fixture(t)
  const order = await purchase(app)
  assert.equal((await app.command('user', review(order))).status, 409)
  assert.equal((await app.command('guest', review(order))).status, 401)
  assert.equal((await app.command('merchant', review(order))).status, 403)
  await complete(app, order.id)
  await app.register('otherUser', 'user', '13900000012')
  assert.equal((await app.command('otherUser', review(order))).status, 403)
  for (const rating of [0, 6, 2.5, '5'])
    assert.equal((await app.command('user', review(order, { rating }))).status, 400)
  for (const content of ['', ' ', '评'.repeat(501)])
    assert.equal((await app.command('user', review(order, { content }))).status, 400)
  assert.equal((await app.command('user', review(order, { itemKey: 'tampered' }))).status, 400)
  const results = await Promise.all([
    app.command('user', review(order)),
    app.command('user', review(order)),
  ])
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409])
  assert.equal((await app.call('user', 'state')).state.reviews.length, 1)
})

test('review images enforce ownership and purpose; public reviews redact identifiers and persist with replies', async (t) => {
  const app = await fixture(t)
  const order = await purchase(app)
  await complete(app, order.id)
  const data = await imageData()
  assert.equal((await app.call('guest', 'review-images', { data })).status, 401)
  assert.equal((await app.call('merchant', 'review-images', { data })).status, 403)
  const uploaded = await app.call('user', 'review-images', { data })
  assert.equal(uploaded.status, 200)
  assert.equal(
    (
      await app.command('merchant', {
        type: 'createProduct',
        title: '不能挪用评价图片',
        price: '19',
        stock: '1',
        cover: uploaded.url,
      })
    ).status,
    403,
  )
  await app.register('otherUser', 'user', '13900000013')
  const foreign = await app.call('otherUser', 'review-images', { data })
  assert.equal((await app.command('user', review(order, { images: [foreign.url] }))).status, 403)
  const productImage = await app.call('merchant', 'images', { data })
  assert.equal(
    (await app.command('user', review(order, { images: [productImage.url] }))).status,
    403,
  )
  assert.equal(
    (await app.command('user', review(order, { images: [uploaded.url, uploaded.url] }))).status,
    400,
  )
  assert.equal(
    (await app.command('user', review(order, { images: Array(4).fill(uploaded.url) }))).status,
    400,
  )
  const key = randomUUID()
  const submitted = await app.command('user', review(order, { images: [uploaded.url] }), key)
  assert.equal(submitted.status, 200)
  const saved = submitted.state.reviews[0]
  assert.equal(saved.orderId, order.id)
  assert.equal(saved.buyerId, undefined)
  assert.equal(
    (await app.command('user', review(order, { images: [uploaded.url] }), key)).status,
    200,
  )
  const publicReview = (await app.call('guest', 'state')).state.reviews[0]
  assert.equal(publicReview.orderId, undefined)
  assert.equal(publicReview.buyerId, undefined)
  assert.match(publicReview.author, /\*\*\*/)
  assert.equal((await app.call('otherUser', 'state')).state.reviews[0].orderId, undefined)
  await app.register('otherMerchant', 'merchant', '13900000014')
  assert.equal(
    (await app.command('otherMerchant', { type: 'replyReview', id: saved.id, content: '越权' }))
      .status,
    403,
  )
  assert.equal((await app.call('otherMerchant', 'state')).state.reviews.length, 0)
  assert.equal(
    (await app.command('user', { type: 'replyReview', id: saved.id, content: '越权' })).status,
    403,
  )
  assert.equal(
    (await app.command('merchant', { type: 'replyReview', id: saved.id, content: ' ' })).status,
    400,
  )
  const reply = { type: 'replyReview', id: saved.id, content: '感谢反馈，我们会继续认真打包。' }
  const replies = await Promise.all([
    app.command('merchant', reply),
    app.command('merchant', reply),
  ])
  assert.deepEqual(replies.map((result) => result.status).sort(), [200, 409])
  await app.restart()
  const restored = (await app.call('guest', 'state')).state.reviews[0]
  assert.equal(restored.reply.content, reply.content)
  assert.equal((await fetch(restored.images[0])).status, 200)
  await app.command('user', { type: 'requestRefund', id: order.id, reason: '协商退款' })
  await app.command('merchant', { type: 'resolveRefund', id: order.id, approve: true })
  assert.equal((await app.call('guest', 'state')).state.reviews[0].refunded, true)
  await app.command('merchant', { type: 'reset' })
  assert.equal((await app.call('guest', 'state')).state.reviews.length, 0)
})

test('each purchased specification can be reviewed once and a later purchase can have its own review', async (t) => {
  const app = await fixture(t)
  const order = await purchase(app, [
    { productId: 'star-fairy', variant: 'standard', quantity: 1, expectedPrice: 12800 },
    { productId: 'star-fairy', variant: 'gift', quantity: 1, expectedPrice: 15800 },
  ])
  await complete(app, order.id)
  for (const item of orderItems(order))
    assert.equal(
      (await app.command('user', review(order, { itemKey: reviewItemKey(item) }))).status,
      200,
    )
  const later = await purchase(app)
  await complete(app, later.id)
  assert.equal((await app.command('user', review(later))).status, 200)
  assert.equal((await app.call('guest', 'state')).state.reviews.length, 3)
})
