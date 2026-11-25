import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { startDemoServer } from '../scripts/demo-server.mjs'
import { productMatchesSearch } from '../packages/shared/src/demo-domain.ts'
import { decodeProductVideo, MAX_VIDEO_BASE64 } from '../scripts/demo-videos.mjs'

const recipient = { name: '规格买家', phone: '13800000000', address: '上海市 测试路 8 号' }
const rows = () => [
  { id: 'pink', name: '樱粉款', price: '29', stock: '1' },
  { id: 'blue', name: '星空款', price: '39', stock: '2' },
]
const product = (fields = {}) => ({
  type: 'createProduct',
  title: '双款收藏挂件',
  subtitle: '选择喜欢的颜色',
  description: '两款独立库存的收藏挂件。',
  category: '周边',
  tag: '新款',
  images: ['/static/demo/star-fairy.jpg'],
  skus: rows(),
  ...fields,
})
const checkout = (id, variant, quantity = 1, price = 2900) => ({
  type: 'checkout',
  items: [{ productId: id, variant, quantity, expectedPrice: price }],
  recipient,
})
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'starisle-products-'))
  const dataFile = join(dir, 'marketplace.json')
  let app = await startDemoServer({ dataFile, port: 0 })
  t.after(async () => {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  })
  const tokens = {}
  async function call(path, data, role = 'merchant', key = randomUUID()) {
    const response = await fetch(`${app.url}/api/demo/${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Role': role,
        'X-Idempotency-Key': key,
        ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
    return { status: response.status, ...(await response.json()) }
  }
  for (const role of ['user', 'merchant'])
    tokens[role] = (
      await call('auth/login', { role, phone: '13800000000', password: '123456' }, 'guest')
    ).session.token
  return {
    call,
    command: (command, role = 'merchant', key) => call('commands', command, role, key),
    state: async () => (await call('state', undefined, 'user')).state,
    restart: async () => {
      await app.close()
      app = await startDemoServer({ dataFile, port: 0 })
    },
    setToken: (role, token) => {
      tokens[role] = token
    },
  }
}

test('custom SKUs retain independent prices and stock, prevent concurrent overselling and preserve order snapshots', async (t) => {
  const app = await fixture(t)
  const created = await app.command(product())
  assert.equal(created.status, 200)
  const id = created.state.products[0].id
  assert.equal(created.state.products[0].price, 2900)
  assert.equal(created.state.products[0].stock, 3)
  const results = await Promise.all([
    app.command(checkout(id, 'pink'), 'user'),
    app.command(checkout(id, 'pink'), 'user'),
  ])
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409])
  let state = await app.state()
  const paid = state.orders[0]
  assert.equal(paid.items[0].variant, '樱粉款')
  assert.equal(paid.items[0].skuId, 'pink')
  assert.equal(paid.amount, 2900)
  assert.deepEqual(
    state.products.find((item) => item.id === id).skus.map((sku) => sku.stock),
    [0, 2],
  )
  const both = await app.command(checkout(id, 'blue', 2, 3900), 'user')
  assert.equal(both.status, 200)
  assert.equal(both.state.products.find((item) => item.id === id).stock, 0)
  assert.equal((await app.command(checkout(id, 'blue', 1, 3900), 'user')).status, 409)
  await app.restart()
  state = await app.state()
  assert.equal(state.products.find((item) => item.id === id).sold, 3)
  assert.equal(state.orders.find((order) => order.id === paid.id).items[0].unitPrice, 2900)
})

test('invalid or stale SKU edits cannot overwrite sales stock and missing SKUs cannot be purchased', async (t) => {
  const app = await fixture(t)
  const original = (await app.command(product())).state.products[0]
  const id = original.id
  assert.equal((await app.command(checkout(id, 'pink'), 'user')).status, 200)
  const edit = {
    type: 'editProduct',
    id,
    title: '调整价格后的挂件',
    expectedVersion: 0,
    skus: [
      { id: 'pink', name: '樱粉款', price: '35' },
      { id: 'blue', name: '星空款', price: '39' },
    ],
  }
  const stale = await app.command({
    ...edit,
    skus: [{ ...edit.skus[0], stock: '9', expectedStock: 1 }, edit.skus[1]],
  })
  assert.equal(stale.status, 409)
  assert.equal((await app.state()).products.find((item) => item.id === id).title, original.title)
  const changed = await app.command(edit)
  assert.equal(changed.status, 200)
  assert.deepEqual(
    changed.state.products[0].skus.map((sku) => sku.stock),
    [0, 2],
  )
  assert.equal(changed.state.products[0].price, 3500)
  assert.equal((await app.command(edit)).status, 409)
  const removed = await app.command({ ...edit, expectedVersion: 1, skus: [edit.skus[0]] })
  assert.equal(removed.status, 200)
  assert.equal((await app.command(checkout(id, 'blue', 1, 3900), 'user')).status, 409)
  assert.equal((await app.state()).orders[0].items[0].variant, '樱粉款')
})

test('invalid SKU definitions and mixed carts fail atomically; idempotent retries only deduct once', async (t) => {
  const app = await fixture(t)
  for (const skus of [
    [],
    [rows()[0], { ...rows()[1], name: '樱粉款' }],
    [{ ...rows()[0], price: '0' }],
    [{ ...rows()[0], stock: '-1' }],
    [{ ...rows()[0], id: 'x/y' }],
  ])
    assert.equal((await app.command(product({ skus }))).status, 400)
  assert.equal((await app.state()).products.length, 4)
  const id = (await app.command(product())).state.products[0].id
  const invalid = checkout(id, 'pink')
  invalid.items.push({ productId: id, variant: 'blue', quantity: 3, expectedPrice: 3900 })
  assert.equal((await app.command(invalid, 'user')).status, 409)
  assert.equal((await app.state()).orders.length, 0)
  assert.equal((await app.state()).products.find((item) => item.id === id).stock, 3)
  const key = randomUUID()
  const first = await app.command(checkout(id, 'pink'), 'user', key)
  await app.restart()
  const retry = await app.command(checkout(id, 'pink'), 'user', key)
  assert.equal(retry.status, 200)
  assert.deepEqual(retry.orderIds, first.orderIds)
  assert.equal(retry.state.orders.length, 1)
  assert.equal(retry.state.products.find((item) => item.id === id).stock, 2)
})

test('uploaded product images persist, are visible in both roles and cannot be assigned by another merchant', async (t) => {
  const app = await fixture(t)
  const data = (
    await sharp({ create: { width: 16, height: 16, channels: 3, background: '#9d7bd1' } })
      .png()
      .toBuffer()
  ).toString('base64')
  assert.equal((await app.call('images', { data }, 'guest')).status, 401)
  assert.equal((await app.call('images', { data }, 'user')).status, 403)
  assert.equal(
    (await app.call('images', { data: Buffer.from('not an image').toString('base64') })).status,
    400,
  )
  const uploaded = await app.call('images', { data })
  assert.equal(uploaded.status, 200)
  const image = await fetch(uploaded.url)
  assert.equal(image.status, 200)
  assert.equal(image.headers.get('content-type'), 'image/jpeg')
  const saved = await app.command(
    product({ images: [uploaded.url, '/static/demo/star-island.jpg'], category: '画作' }),
  )
  assert.equal(saved.status, 200)
  const id = saved.state.products[0].id
  assert.equal(saved.state.products[0].images.length, 2)
  assert.equal((await app.state()).products.find((item) => item.id === id).cover, uploaded.url)
  await app.restart()
  const restored = (await app.state()).products.find((item) => item.id === id)
  assert.equal((await fetch(restored.cover)).status, 200)
  assert.equal(restored.description, '两款独立库存的收藏挂件。')
  const other = await app.call(
    'auth/register',
    { role: 'merchant', phone: '13900000001', password: '123456', qualificationCode: '1234' },
    'guest',
  )
  app.setToken('other', other.session.token)
  const foreign = await app.call('images', { data }, 'other')
  assert.equal(foreign.status, 200)
  assert.equal((await app.command(product({ images: [foreign.url] }))).status, 403)
})

test('refund restores the purchased SKU without altering other specifications', async (t) => {
  const app = await fixture(t)
  const created = await app.command(product())
  const id = created.state.products[0].id
  const paid = await app.command(checkout(id, 'pink'), 'user')
  const orderId = paid.state.orders[0].id
  await app.command({ type: 'requestRefund', id: orderId, reason: '颜色选错' }, 'user')
  const refunded = await app.command({ type: 'resolveRefund', id: orderId, approve: true })
  assert.equal(refunded.status, 200)
  const item = refunded.state.products.find((p) => p.id === id)
  assert.equal(item.skus.find((s) => s.id === 'pink').stock, 1)
  assert.equal(item.skus.find((s) => s.id === 'pink').sold, 0)
  assert.equal(item.skus.find((s) => s.id === 'blue').stock, 2)
  assert.equal(item.stock, 3)
  assert.equal(item.sold, 0)
})

test('refund authorization isolates buyers and shops and deleted SKUs never restock other variants', async (t) => {
  const app = await fixture(t)
  const created = await app.command(product())
  const id = created.state.products[0].id
  const paid = await app.command(checkout(id, 'pink'), 'user')
  const orderId = paid.state.orders[0].id
  const otherUser = await app.call(
    'auth/register',
    { role: 'user', phone: '13900000002', password: '123456' },
    'guest',
  )
  app.setToken('otherUser', otherUser.session.token)
  assert.equal(
    (
      await app.call(
        'commands',
        { type: 'requestRefund', id: orderId, reason: '越权' },
        'otherUser',
      )
    ).status,
    403,
  )
  await app.command({ type: 'requestRefund', id: orderId, reason: '规格删除后退款' }, 'user')
  const otherShop = await app.call(
    'auth/register',
    { role: 'merchant', phone: '13900000003', password: '123456', qualificationCode: '1234' },
    'guest',
  )
  app.setToken('otherShop', otherShop.session.token)
  assert.equal(
    (await app.call('commands', { type: 'resolveRefund', id: orderId, approve: true }, 'otherShop'))
      .status,
    403,
  )
  const edited = await app.command({ ...product({ skus: [rows()[1]] }), type: 'editProduct', id })
  assert.equal(edited.status, 200)
  const results = await Promise.all([
    app.command({ type: 'resolveRefund', id: orderId, approve: true }),
    app.command({ type: 'resolveRefund', id: orderId, approve: true }),
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
  const final = results.find((r) => r.status === 200).state.products.find((p) => p.id === id)
  assert.equal(final.skus.length, 1)
  assert.equal(final.skus[0].stock, 2)
  assert.equal(final.stock, 2)
  assert.equal(final.sold, 0)
})

test('product videos validate MP4 data, enforce ownership and support range playback after restart', async (t) => {
  const app = await fixture(t)
  const input = await readFile(new URL('./fixtures/product-demo.mp4', import.meta.url))
  const data = input.toString('base64')
  assert.ok(decodeProductVideo(data).duration > 1)
  assert.equal((await app.call('videos', { data }, 'guest')).status, 401)
  assert.equal((await app.call('videos', { data }, 'user')).status, 403)
  assert.equal(
    (await app.call('videos', { data: Buffer.from('fake.mp4').toString('base64') })).status,
    400,
  )
  assert.throws(() => decodeProductVideo('A'.repeat(MAX_VIDEO_BASE64 + 4)))
  const long = Buffer.from(input)
  const mdhd = long.indexOf(Buffer.from('mdhd'))
  const version = long[mdhd + 4]
  const scaleOffset = mdhd + (version === 1 ? 24 : 16)
  long.writeUInt32BE(1000, scaleOffset)
  if (version === 1) long.writeBigUInt64BE(61000n, scaleOffset + 4)
  else long.writeUInt32BE(61000, scaleOffset + 4)
  assert.throws(() => decodeProductVideo(long.toString('base64')))
  const uploaded = await app.call('videos', { data })
  assert.equal(uploaded.status, 200)
  const created = await app.command(product({ video: uploaded.url }))
  assert.equal(created.status, 200)
  const id = created.state.products[0].id
  assert.equal((await app.state()).products.find((p) => p.id === id).video, uploaded.url)
  const video = await fetch(uploaded.url)
  assert.equal(video.headers.get('content-type'), 'video/mp4')
  assert.deepEqual(Buffer.from(await video.arrayBuffer()), input)
  const partial = await fetch(uploaded.url, { headers: { Range: 'bytes=0-31' } })
  assert.equal(partial.status, 206)
  assert.equal(partial.headers.get('content-range'), `bytes 0-31/${input.length}`)
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()), input.subarray(0, 32))
  const suffix = await fetch(uploaded.url, { headers: { Range: 'bytes=-16' } })
  assert.equal(suffix.status, 206)
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), input.subarray(-16))
  assert.equal((await fetch(uploaded.url, { headers: { Range: 'bytes=999999-' } })).status, 416)
  assert.equal(
    (await fetch(uploaded.url, { method: 'HEAD' })).headers.get('content-length'),
    String(input.length),
  )
  const foreign = await app.call(
    'auth/register',
    { role: 'merchant', phone: '13900000004', password: '123456', qualificationCode: '1234' },
    'guest',
  )
  app.setToken('otherVideo', foreign.session.token)
  const foreignUpload = await app.call('videos', { data }, 'otherVideo')
  assert.equal(foreignUpload.status, 200)
  assert.equal((await app.command(product({ video: foreignUpload.url }))).status, 403)
  assert.equal(
    (
      await app.command({
        ...product({ video: 'https://example.com/fake.mp4' }),
        type: 'editProduct',
        id,
      })
    ).status,
    403,
  )
  await app.restart()
  const saved = (await app.state()).products.find((p) => p.id === id)
  assert.match(saved.video, /\/api\/demo\/videos\//)
  assert.equal((await fetch(saved.video)).status, 200)
  const edited = await app.command({ ...product(), type: 'editProduct', id })
  assert.equal(edited.status, 200)
  assert.ok(edited.state.products.find((p) => p.id === id).video)
  const removed = await app.command({ ...product({ video: '' }), type: 'editProduct', id })
  assert.equal(removed.state.products.find((p) => p.id === id).video, '')
})

test('product tags normalize, deduplicate, persist and retain legacy tag compatibility', async (t) => {
  const app = await fixture(t)
  const created = await app.command(
    product({ tags: [' #原神 ', '徽章', 'Ｇｅｎｓｈｉｎ', 'genshin'] }),
  )
  assert.equal(created.status, 200)
  const item = created.state.products[0]
  assert.deepEqual(item.tags, ['原神', '徽章', 'Genshin'])
  assert.equal(item.tag, '原神')
  const tenTags = Array.from({ length: 10 }, (_, index) => `标签${index + 1}`)
  assert.equal((await app.command(product({ tags: tenTags }))).status, 200)
  assert.equal((await app.command(product({ tags: [...tenTags, '标签11'] }))).status, 400)
  assert.equal(
    (await app.command(product({ tags: ['这个标签已经超过十二个汉字限制了'] }))).status,
    400,
  )
  assert.equal((await app.command(product({ tags: ['#'] }))).status, 400)
  assert.equal((await app.command(product({ tags: [123] }))).status, 400)
  assert.equal((await app.command(product({ tags: '原神' }))).status, 400)
  await app.restart()
  assert.deepEqual((await app.state()).products.find((p) => p.id === item.id).tags, item.tags)
  const { tag, ...fields } = product()
  const kept = await app.command({ ...fields, type: 'editProduct', id: item.id })
  assert.deepEqual(kept.state.products.find((p) => p.id === item.id).tags, item.tags)
  const removed = await app.command({ ...fields, type: 'editProduct', id: item.id, tags: [] })
  assert.deepEqual(removed.state.products.find((p) => p.id === item.id).tags, [])
  assert.equal(removed.state.products.find((p) => p.id === item.id).tag, '')
  const legacy = await app.command(product({ tag: '画师原创' }))
  assert.deepEqual(legacy.state.products[0].tags, ['画师原创'])
})

test('user search matches a tag when the product name contains no keyword', () => {
  const item = { title: '121', tag: '原神', tags: ['原神'] }
  assert.equal(productMatchesSearch(item, '原神'), true)
  assert.equal(productMatchesSearch(item, '  原神  '), true)
  assert.equal(productMatchesSearch(item, '#原神'), true)
  assert.equal(productMatchesSearch(item, '＃原神'), true)
  assert.equal(productMatchesSearch({ title: '121', tag: '原神', tags: [] }, '原神'), true)
  assert.equal(productMatchesSearch({ title: '121', tag: '原神' }, '原神'), true)
  assert.equal(productMatchesSearch({ title: '原神', tag: '原神周边' }, '#原神'), false)
  assert.equal(
    productMatchesSearch({ title: '121', tag: 'Genshin Impact' }, '#GENSHIN  IMPACT'),
    true,
  )
})

test('adding a tag while editing a legacy product makes it searchable to users', async (t) => {
  const app = await fixture(t)
  const before = (await app.state()).products.find((p) => p.id === 'star-fairy')
  assert.equal(before.tags, undefined)
  const edited = await app.command({
    type: 'editProduct',
    id: before.id,
    title: before.title,
    price: '128',
    tags: ['原神'],
    expectedVersion: before.managementVersion || 0,
  })
  assert.equal(edited.status, 200)
  const visible = (await app.state()).products.find((p) => p.id === before.id)
  assert.deepEqual(visible.tags, ['原神'])
  assert.equal(productMatchesSearch(visible, '原神'), true)
  assert.equal(productMatchesSearch(visible, '#原神'), true)
  await app.restart()
  assert.equal(
    productMatchesSearch(
      (await app.state()).products.find((p) => p.id === before.id),
      '原神',
    ),
    true,
  )
})
