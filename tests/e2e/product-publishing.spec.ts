import { test, expect } from './fixtures'
import { pay } from './checkout-flows'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'
const api = 'http://127.0.0.1:8787/api/demo'

test.beforeEach(async ({ request }) => {
  expect(
    (
      await request.post(`${api}/commands`, {
        headers: { 'X-Demo-Role': 'merchant', 'X-Idempotency-Key': randomUUID() },
        data: { type: 'reset' },
      })
    ).ok(),
  ).toBe(true)
})

test('a merchant uploads images, publishes custom SKUs and preserves sales stock when editing while customers buy', async ({
  page: merchant,
  context,
  request,
}) => {
  await merchant.goto('http://127.0.0.1:4174/#/pages/merchant/index')
  await merchant.getByTestId('publish-product').click()
  const png = await sharp({
    create: { width: 300, height: 300, channels: 3, background: '#baa2dd' },
  })
    .png()
    .toBuffer()
  const pink = await sharp({
    create: { width: 300, height: 300, channels: 3, background: '#efc4cf' },
  })
    .png()
    .toBuffer()
  const chooser = merchant.waitForEvent('filechooser')
  await merchant.getByTestId('upload-product-image').click()
  await (
    await chooser
  ).setFiles([
    { name: 'front.png', mimeType: 'image/png', buffer: png },
    { name: 'back.png', mimeType: 'image/png', buffer: pink },
  ])
  await expect(merchant.locator('.image-item')).toHaveCount(2)
  await expect(merchant.locator('.image-item img').first()).toHaveAttribute(
    'src',
    /\/api\/demo\/images\//,
  )
  await merchant.getByTestId('edit-product-title').locator('input').fill('双色收藏画片')
  await merchant.getByTestId('product-category-画作').click()
  await merchant.getByTestId('edit-product-subtitle').locator('input').fill('选择喜欢的款式')
  await merchant
    .getByTestId('edit-product-description')
    .locator('textarea')
    .fill('樱粉款与星空款分别计价，附正反面展示图。')
  await merchant.getByTestId('sku-name-0').locator('input').fill('樱粉款')
  await merchant.getByTestId('edit-product-price').locator('input').fill('29')
  await merchant.getByTestId('edit-product-stock').locator('input').fill('2')
  await merchant.getByTestId('add-product-sku').click()
  await merchant.getByTestId('sku-name-1').locator('input').fill('星空款')
  await merchant.getByTestId('sku-price-1').locator('input').fill('39')
  await merchant.getByTestId('sku-stock-1').locator('input').fill('1')
  await mkdir('.tools/previews', { recursive: true })
  for (const width of [375, 390, 430]) {
    await merchant.setViewportSize({ width, height: 844 })
    expect(await merchant.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    )
  }
  await merchant.setViewportSize({ width: 390, height: 844 })
  await merchant.getByTestId('sku-editor-0').scrollIntoViewIfNeeded()
  await merchant.screenshot({ path: '.tools/previews/merchant-product-editor.png' })
  await merchant.getByTestId('save-product').click()
  await expect(merchant.getByTestId('product-editor')).toHaveCount(0)
  const state = async () => (await (await request.get(`${api}/state`)).json()).state
  const product = (await state()).products.find(
    (item: { title: string }) => item.title === '双色收藏画片',
  )
  expect(product.category).toBe('画作')
  expect(product.stock).toBe(3)
  expect(product.price).toBe(2900)
  expect((await request.get(product.images[0])).ok()).toBe(true)
  await merchant.getByTestId('nav-products').click()
  await merchant.getByTestId(`edit-${product.id}`).click()
  await merchant.getByTestId('edit-product-price').locator('input').fill('35')

  const customer = await context.newPage()
  try {
    await customer.goto('http://127.0.0.1:4173/#/pages/index/index')
    await customer.getByTestId('product-search').locator('input').fill('双色收藏画片')
    await customer.getByTestId(`product-${product.id}`).click()
    await expect(customer.locator('.gallery-count')).toHaveText('1 / 2')
    await expect(customer.locator('.description-copy')).toContainText('樱粉款与星空款分别计价')
    await customer.getByTestId('add-to-cart').click()
    await expect(customer.getByTestId('sku-price')).toHaveText('¥29')
    await customer.getByTestId('confirm-sku').click()
    await customer.getByTestId('add-to-cart').click()
    await customer.getByTestId(`variant-${product.skus[1].id}`).click()
    await expect(customer.getByTestId('sku-price')).toHaveText('¥39')
    await expect(customer.getByTestId('sku-stock')).toContainText('仅剩 1 件')
    await expect(customer.getByTestId('quantity-plus')).toHaveAttribute('disabled', 'true')
    await customer.getByTestId('confirm-sku').click()
    await customer.getByLabel('购物车', { exact: true }).click()
    await expect(customer.locator('.cart-item')).toHaveCount(2)
    await expect(customer.getByTestId('cart-total')).toHaveText('¥68')
    await expect(customer.locator('.cart-variant').filter({ hasText: '星空款' })).toBeVisible()
    await customer.getByTestId('cart-checkout').click()
    await expect(customer.locator('.checkout-variant')).toHaveText(['樱粉款 × 1', '星空款 × 1'])
    await pay(customer)
    const paid = (await state()).orders[0]
    expect(paid.amount).toBe(6800)
    expect(paid.items.map((item: { variant: string }) => item.variant)).toEqual([
      '樱粉款',
      '星空款',
    ])
    await merchant.getByTestId('save-product').click()
    await expect(merchant.getByTestId('product-editor')).toHaveCount(0)
    const updated = (await state()).products.find((item: { id: string }) => item.id === product.id)
    expect(updated.skus.map((sku: { stock: number }) => sku.stock)).toEqual([1, 0])
    expect(updated.price).toBe(3500)
    expect((await state()).orders[0].items[0].unitPrice).toBe(2900)
    await customer.goto(`http://127.0.0.1:4173/#/pages/product/detail?id=${product.id}`)
    await customer.getByTestId('buy-now').click()
    await customer.getByTestId(`variant-${product.skus[1].id}`).click()
    await expect(customer.getByTestId('sku-stock')).toHaveText('已售罄')
    await expect(customer.getByTestId('confirm-sku')).toHaveAttribute('disabled', 'true')
  } finally {
    await customer.close()
  }
})

test('removed SKU cart lines remain removable and block checkout without changing other SKU stock', async ({
  page,
  request,
}) => {
  const create = await request.post(`${api}/commands`, {
    headers: { 'X-Demo-Role': 'merchant', 'X-Idempotency-Key': randomUUID() },
    data: {
      type: 'createProduct',
      title: '规格调整挂件',
      images: ['/static/demo/star-fairy.jpg'],
      skus: [
        { id: 'a', name: '款式 A', price: '20', stock: '2' },
        { id: 'b', name: '款式 B', price: '30', stock: '2' },
      ],
    },
  })
  expect(create.ok()).toBe(true)
  const product = (await create.json()).state.products[0]
  await page.goto(`http://127.0.0.1:4173/#/pages/product/detail?id=${product.id}`)
  await page.getByTestId('add-to-cart').click()
  await page.getByTestId('confirm-sku').click()
  await page.getByLabel('购物车', { exact: true }).click()
  expect(
    (
      await request.post(`${api}/commands`, {
        headers: { 'X-Demo-Role': 'merchant', 'X-Idempotency-Key': randomUUID() },
        data: {
          type: 'editProduct',
          id: product.id,
          title: product.title,
          expectedVersion: 0,
          skus: [{ id: 'b', name: '款式 B', price: '30' }],
        },
      })
    ).ok(),
  ).toBe(true)
  await expect(page.getByTestId('cart-stock-error')).toContainText('商品规格已调整')
  await expect(page.getByTestId('cart-checkout')).toHaveAttribute('disabled', 'true')
  await page.getByLabel('移除商品', { exact: true }).click()
  await expect(page.getByText('口袋里还没有心动好物')).toBeVisible()
})

test('merchant publishes a video that customers can play, then removes it without affecting images', async ({
  page: merchant,
  context,
  request,
}) => {
  await merchant.goto('http://127.0.0.1:4174/#/pages/merchant/index')
  await merchant.getByTestId('publish-product').click()
  const picker = merchant.waitForEvent('filechooser')
  await merchant.getByTestId('upload-product-video').click()
  await (await picker).setFiles('tests/fixtures/product-demo.mp4')
  await expect(merchant.getByTestId('editor-product-video').first()).toBeVisible()
  await merchant.getByTestId('edit-product-title').locator('input').fill('视频展示收藏挂件')
  await merchant.getByTestId('edit-product-price').locator('input').fill('29')
  await merchant.getByTestId('edit-product-stock').locator('input').fill('2')
  await merchant.getByTestId('save-product').click()
  await expect(merchant.getByTestId('product-editor')).toHaveCount(0)
  const state = async () => (await (await request.get(`${api}/state`)).json()).state
  const product = (await state()).products.find(
    (item: { title: string }) => item.title === '视频展示收藏挂件',
  )
  expect(product.video).toMatch(/\/api\/demo\/videos\//)
  const customer = await context.newPage()
  try {
    await customer.goto(`http://127.0.0.1:4173/#/pages/product/detail?id=${product.id}`)
    const video = customer.getByTestId('detail-product-video').first().locator('video')
    await expect(video).toBeVisible()
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
      .toBeGreaterThanOrEqual(2)
    expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true)
    await video.evaluate((el: HTMLVideoElement) => el.play())
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
      .toBeGreaterThan(0)
    await customer.reload()
    await expect(customer.getByTestId('detail-product-video').first()).toBeVisible()
    await merchant.getByTestId('nav-products').click()
    await merchant.getByTestId(`edit-${product.id}`).click()
    await expect(merchant.getByTestId('editor-product-video').first()).toBeVisible()
    await merchant.getByTestId('remove-product-video').click()
    await merchant.getByTestId('save-product').click()
    await expect(customer.getByTestId('detail-product-video')).toHaveCount(0)
    expect((await state()).products.find((p: { id: string }) => p.id === product.id).cover).toBe(
      product.cover,
    )
  } finally {
    await customer.close()
  }
})

test('merchant creates multiple tags and customers find exact matching tags by input or click', async ({
  page: merchant,
  context,
  request,
}) => {
  const command = async (data: Record<string, unknown>) => {
    const response = await request.post(`${api}/commands`, {
      headers: { 'X-Demo-Role': 'merchant', 'X-Idempotency-Key': randomUUID() },
      data,
    })
    expect(response.ok()).toBe(true)
    return (await response.json()).state
  }
  const fields = {
    type: 'createProduct',
    price: '19',
    stock: '5',
    images: ['/static/demo/star-fairy.jpg'],
    category: '周边',
  }
  const same = (await command({ ...fields, title: '另一款挂件', tags: ['原神'] })).products[0]
  const similar = (await command({ ...fields, title: '原神名称相似商品', tags: ['原神周边'] }))
    .products[0]
  const hidden = (await command({ ...fields, title: '下架商品', tags: ['原神'], published: false }))
    .products[0]
  await merchant.goto('http://127.0.0.1:4174/#/pages/merchant/index')
  await merchant.getByTestId('publish-product').click()
  await merchant.getByTestId('edit-product-title').locator('input').fill('角色收藏徽章')
  await merchant.getByTestId('edit-product-price').locator('input').fill('29')
  await merchant.getByTestId('edit-product-stock').locator('input').fill('2')
  await merchant.getByTestId('edit-product-tag').locator('input').fill('原神，徽章')
  await merchant.getByTestId('add-product-tag').click()
  await expect(merchant.locator('.editor-tag')).toHaveCount(2)
  // An unconfirmed draft is included when saving; case-insensitive duplicate tags are merged.
  await merchant.getByTestId('edit-product-tag').locator('input').fill('Genshin,genshin')
  await merchant.getByTestId('save-product').click()
  await expect(merchant.getByTestId('product-editor')).toHaveCount(0)
  const data = (await (await request.get(`${api}/state`)).json()).state
  const target = data.products.find((p: { title: string }) => p.title === '角色收藏徽章')
  expect(target.tags).toEqual(['原神', '徽章', 'Genshin'])
  const customer = await context.newPage()
  try {
    await customer.goto('http://127.0.0.1:4173/#/pages/index/index')
    const input = customer.getByTestId('product-search').locator('input')
    await input.fill('原神')
    await customer.getByTestId('submit-search').click()
    await expect(customer.getByTestId(`product-${target.id}`)).toBeVisible()
    await expect(customer.getByTestId(`product-${same.id}`)).toBeVisible()
    await input.press('Enter')
    await expect(customer.getByTestId(`product-${target.id}`)).toBeVisible()
    await input.fill('徽章')
    await expect(customer.getByTestId(`product-${target.id}`)).toBeVisible()
    await input.fill('  ＃原神  ')
    await expect(customer.getByTestId('tag-search-summary')).toContainText('原神')
    await expect(customer.getByTestId(`product-${target.id}`)).toBeVisible()
    await expect(customer.getByTestId(`product-${same.id}`)).toBeVisible()
    await expect(customer.getByTestId(`product-${similar.id}`)).toHaveCount(0)
    await expect(customer.getByTestId(`product-${hidden.id}`)).toHaveCount(0)
    await expect(customer.getByTestId('shop-results')).toHaveCount(0)
    await input.fill('#GENSHIN')
    await expect(customer.getByTestId(`product-${target.id}`)).toBeVisible()
    await customer.getByTestId(`product-${target.id}`).click()
    await customer.getByLabel('查找标签 原神', { exact: true }).click()
    await expect(customer.getByTestId('tag-search-summary')).toContainText('原神')
    await expect(customer.getByTestId(`product-${same.id}`)).toBeVisible()
    await customer.reload()
    await expect(customer.getByTestId('tag-search-summary')).toContainText('原神')
    await customer
      .getByTestId(`product-${target.id}`)
      .locator('..')
      .getByLabel('查找标签 徽章', { exact: true })
      .click()
    await expect(customer.getByTestId('tag-search-summary')).toContainText('徽章')
    await expect(customer.getByTestId(`product-${same.id}`)).toHaveCount(0)
    await input.fill('#没有这个标签')
    await expect(customer.locator('.empty-state')).toBeVisible()
    await customer.getByLabel('清空搜索', { exact: true }).click()
    await expect(customer.getByTestId(`product-${same.id}`)).toBeVisible()
  } finally {
    await customer.close()
  }
})
