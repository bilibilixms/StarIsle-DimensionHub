import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import {
  applyDemoCommand,
  createDemoMarketplace,
  DemoDomainError,
  DEMO_SHOP_ID,
  marketplaceShops,
  productShopId,
  productVisible,
  shopCanSell,
} from '../packages/shared/src/demo-domain.ts'
import {
  createDemoAuth,
  ensureDemoAdmin,
  authenticate,
  applyAuth,
  sessionView,
} from './demo-auth.mjs'
import { adminSnapshot, applyAdminCommand } from './demo-admin.mjs'
import {
  decodeProductImage,
  imagePathPattern,
  normalizeProductImages,
  normalizeReviewImages,
} from './demo-images.mjs'
import {
  decodeProductVideo,
  videoPathPattern,
  normalizeProductVideo,
  MAX_VIDEO_BASE64,
} from './demo-videos.mjs'

export async function startDemoServer({ dataFile, port = 8787, host = '127.0.0.1' }) {
  let store
  try {
    store = JSON.parse(await readFile(dataFile, 'utf8'))
    if (store.schema !== 1 || store.marketplace?.version !== 1 || !store.receipts)
      throw new Error(`不支持的演示数据格式：${dataFile}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    store = { schema: 1, marketplace: createDemoMarketplace(randomUUID()), receipts: {} }
    await persist(store)
  }
  if (!store.auth) {
    store.auth = createDemoAuth()
    store.receipts = Object.fromEntries(
      Object.entries(store.receipts).map(([key, value]) => [`demo-user:${key}`, value]),
    )
    await persist(store)
  }
  if (ensureDemoAdmin(store.auth)) await persist(store)
  async function persist(next) {
    await mkdir(dirname(dataFile), { recursive: true })
    const temporary = `${dataFile}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    await rename(temporary, dataFile)
  }
  let queue = Promise.resolve()
  function transaction(task) {
    const result = queue.then(task)
    queue = result.catch(() => {})
    return result
  }
  function snapshot(role, identity) {
    const state = structuredClone(store.marketplace)
    if (role === 'user') {
      state.orders = state.orders.filter((order) => order.buyerId === identity?.account.id)
      state.products = state.products.map((product) => ({
        ...product,
        published: productVisible(state, product),
      }))
      state.shops = marketplaceShops(state).filter((shop) => shopCanSell(state, shop.id))
    } else {
      const shopId = identity.account.shopId
      state.products = state.products.filter((product) => productShopId(product) === shopId)
      state.orders = state.orders.filter((order) => productShopId(order) === shopId)
      state.shop = marketplaceShops(state).find((shop) => shop.id === shopId) || {
        name: '我的小店',
        description: '',
      }
      state.shops = marketplaceShops(store.marketplace).filter((shop) => shop.id === shopId)
    }
    const publicUrl = (path) =>
      imagePathPattern.test(path) || videoPathPattern.test(path)
        ? `http://${host}:${server.address().port}${path}`
        : path
    for (const product of state.products) {
      product.cover = publicUrl(product.cover)
      if (product.images) product.images = product.images.map(publicUrl)
      if (product.video) product.video = publicUrl(product.video)
    }
    state.reviews = (store.marketplace.reviews || [])
      .filter((review) =>
        role === 'merchant'
          ? review.shopId === identity.account.shopId
          : review.buyerId === identity?.account.id ||
            state.products.some((product) => product.id === review.productId && product.published),
      )
      .map((review) => {
        const { buyerId, orderId, ...visible } = review
        return {
          ...visible,
          ...(role === 'merchant' || buyerId === identity?.account.id ? { orderId } : {}),
          images: review.images.map(publicUrl),
          refunded: store.marketplace.orders.some(
            (order) => order.id === orderId && order.status === '已退款',
          ),
        }
      })
    for (const order of state.orders) {
      order.cover = publicUrl(order.cover)
      for (const item of order.items || []) item.cover = publicUrl(item.cover)
    }
    return state
  }
  const server = createServer(async (request, response) => {
    function send(status, body) {
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      response.end(JSON.stringify(body))
    }
    const origin = request.headers.origin
    if (origin) {
      let allowed = false
      try {
        const url = new URL(origin)
        allowed =
          ['http:', 'https:'].includes(url.protocol) &&
          ['localhost', '127.0.0.1', 'servicewechat.com'].includes(url.hostname)
      } catch {}
      if (!allowed) return send(403, { message: '仅支持本地演示来源' })
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Vary', 'Origin')
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
      response.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Demo-Role, X-Idempotency-Key, Authorization, Range',
      )
      response.setHeader('Access-Control-Allow-Private-Network', 'true')
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }
    const path = new URL(request.url, 'http://localhost').pathname
    if (request.method === 'GET' && path === '/health')
      return send(200, { status: 'ok', mode: 'local-demo' })
    const role = request.headers['x-demo-role'] || 'user'
    let identity
    try {
      identity = authenticate(store, request.headers.authorization)
      const videoId = videoPathPattern.exec(path)?.[1]
      if (['GET', 'HEAD'].includes(request.method) && videoId) {
        if (!store.videos?.[videoId]) return send(404, { message: '视频不存在' })
        const file = resolve(dirname(dataFile), 'uploads', `${videoId}.mp4`)
        let size
        try {
          size = (await stat(file)).size
        } catch (error) {
          if (error.code === 'ENOENT') return send(404, { message: '视频不存在' })
          throw error
        }
        let start = 0,
          end = size - 1
        const headers = {
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        }
        if (request.headers.range) {
          const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range)
          if (!range || (!range[1] && !range[2])) {
            response.writeHead(416, { 'Content-Range': `bytes */${size}` })
            response.end()
            return
          }
          start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
          end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1
          if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start < 0 ||
            start > end ||
            start >= size
          ) {
            response.writeHead(416, { 'Content-Range': `bytes */${size}` })
            response.end()
            return
          }
          headers['Content-Range'] = `bytes ${start}-${end}/${size}`
        }
        headers['Content-Length'] = end - start + 1
        response.writeHead(request.headers.range ? 206 : 200, headers)
        if (request.method === 'HEAD') {
          response.end()
          return
        }
        const stream = createReadStream(file, { start, end })
        stream.on('error', () => response.destroy())
        response.on('close', () => stream.destroy())
        stream.pipe(response)
        return
      }
      const imageId = imagePathPattern.exec(path)?.[1]
      if (request.method === 'GET' && imageId) {
        if (!store.images?.[imageId]) return send(404, { message: '图片不存在' })
        try {
          const image = await readFile(resolve(dirname(dataFile), 'uploads', `${imageId}.jpg`))
          response.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
          })
          response.end(image)
          return
        } catch (error) {
          if (error.code === 'ENOENT') return send(404, { message: '图片不存在' })
          throw error
        }
      }
      if (request.method === 'GET' && path === '/api/demo/auth/session') {
        await queue
        identity = authenticate(store, request.headers.authorization)
        if (!identity) throw new DemoDomainError('登录已失效，请重新登录', 401)
        return send(200, { session: sessionView(identity) })
      }
      if (request.method === 'GET' && path === '/api/demo/admin/state') {
        await queue
        identity = authenticate(store, request.headers.authorization)
        if (!identity) throw new DemoDomainError('请先登录管理员账号', 401)
        if (identity.role !== 'admin') throw new DemoDomainError('仅管理员可以访问', 403)
        return send(200, { state: adminSnapshot(store) })
      }
      if (request.method === 'GET' && path === '/api/demo/state') {
        await queue
        identity = authenticate(store, request.headers.authorization)
        if (request.headers.authorization && !identity)
          throw new DemoDomainError('登录已失效，请重新登录', 401)
        if (!['user', 'merchant'].includes(role)) throw new DemoDomainError('请选择演示角色')
        if (role === 'merchant' && !identity) throw new DemoDomainError('请先登录商家账号', 401)
        if (identity && identity.role !== role) throw new DemoDomainError('请登录对应身份', 403)
        return send(200, { state: snapshot(role, identity) })
      }
      const authAction = /^\/api\/demo\/auth\/(register|login|quick-login|logout)$/.exec(path)?.[1]
      const adminCommand = path === '/api/demo/admin/commands'
      const reviewImageUpload = path === '/api/demo/review-images'
      const imageUpload = path === '/api/demo/images' || reviewImageUpload
      if (reviewImageUpload && (!identity || identity.role !== 'user'))
        throw new DemoDomainError('请先登录用户账号上传评价图片', identity ? 403 : 401)
      const videoUpload = path === '/api/demo/videos'
      if (videoUpload && (!identity || identity.role !== 'merchant'))
        throw new DemoDomainError('请先登录商家账号上传视频', identity ? 403 : 401)
      if (imageUpload && !reviewImageUpload && (!identity || identity.role !== 'merchant'))
        throw new DemoDomainError('请先登录商家账号上传图片', identity ? 403 : 401)
      if (
        request.method !== 'POST' ||
        (path !== '/api/demo/commands' &&
          !adminCommand &&
          !authAction &&
          !imageUpload &&
          !videoUpload)
      )
        return send(404, { message: '接口不存在' })
      if (!request.headers['content-type']?.startsWith('application/json'))
        return send(415, { message: '请使用 JSON 请求' })
      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > (videoUpload ? MAX_VIDEO_BASE64 + 1024 : imageUpload ? 2_850_000 : 65536))
          return send(413, { message: '请求内容过大' })
        chunks.push(chunk)
      }
      const body = Buffer.concat(chunks).toString('utf8')
      let command
      try {
        command = JSON.parse(body)
      } catch {
        return send(400, { message: '请求 JSON 无效' })
      }
      if (!command || typeof command !== 'object' || Array.isArray(command))
        return send(400, { message: '操作内容无效' })
      if (videoUpload) {
        const { video, duration } = decodeProductVideo(command.data)
        const id = await transaction(async () => {
          const current = authenticate(store, request.headers.authorization)
          if (!current || current.role !== 'merchant')
            throw new DemoDomainError('登录已失效，请重新登录', 401)
          const id = randomUUID()
          const directory = resolve(dirname(dataFile), 'uploads')
          await mkdir(directory, { recursive: true })
          await writeFile(resolve(directory, `${id}.mp4`), video)
          const next = structuredClone(store)
          next.videos ||= {}
          next.videos[id] = { ownerId: current.account.id, duration, size: video.length }
          await persist(next)
          store = next
          return id
        })
        return send(200, {
          url: `http://${host}:${server.address().port}/api/demo/videos/${id}.mp4`,
          duration,
        })
      }
      if (imageUpload) {
        const image = await decodeProductImage(command.data)
        const id = await transaction(async () => {
          const current = authenticate(store, request.headers.authorization)
          if (!current || current.role !== (reviewImageUpload ? 'user' : 'merchant'))
            throw new DemoDomainError('登录已失效，请重新登录', 401)
          const id = randomUUID()
          const directory = resolve(dirname(dataFile), 'uploads')
          await mkdir(directory, { recursive: true })
          await writeFile(resolve(directory, `${id}.jpg`), image)
          const next = structuredClone(store)
          next.images ||= {}
          next.images[id] = {
            ownerId: current.account.id,
            purpose: reviewImageUpload ? 'review' : 'product',
          }
          await persist(next)
          store = next
          return id
        })
        return send(200, {
          url: `http://${host}:${server.address().port}/api/demo/images/${id}.jpg`,
        })
      }
      if (authAction) {
        const result = await transaction(async () => {
          const next = structuredClone(store)
          let response
          if (authAction === 'logout') {
            if (identity) delete next.auth.sessions[identity.token]
            response = { success: true }
          } else response = { session: applyAuth(next, authAction, command) }
          await persist(next)
          store = next
          return response
        })
        return send(200, result)
      }
      if (!identity) throw new DemoDomainError('请先登录后再操作', 401)
      if (adminCommand) {
        if (identity.role !== 'admin') throw new DemoDomainError('仅管理员可以执行此操作', 403)
        const key = request.headers['x-idempotency-key']
        if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(key))
          throw new DemoDomainError('操作标识无效，请重新操作')
        const result = await transaction(async () => {
          const current = authenticate(store, request.headers.authorization)
          if (!current) throw new DemoDomainError('登录已失效，请重新登录', 401)
          const receiptKey = `${current.account.id}:admin:${key}`
          const fingerprint = JSON.stringify(command)
          const previous = store.receipts[receiptKey]
          if (previous) {
            if (previous.fingerprint !== fingerprint)
              throw new DemoDomainError('操作标识已用于其他内容', 409)
            return { state: adminSnapshot(store) }
          }
          const next = structuredClone(store)
          applyAdminCommand(next, command, current, randomUUID)
          next.receipts[receiptKey] = { fingerprint }
          await persist(next)
          store = next
          return { state: adminSnapshot(store) }
        })
        return send(200, result)
      }
      if (identity.role !== role) throw new DemoDomainError('请登录对应身份', 403)
      if (!['user', 'merchant'].includes(role))
        throw new DemoDomainError('当前身份不能执行交易操作', 403)
      if (typeof command.type !== 'string') throw new DemoDomainError('操作内容无效')
      const key = request.headers['x-idempotency-key']
      if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(key))
        return send(400, { message: '操作标识无效，请重新操作' })
      const result = await transaction(async () => {
        if (!authenticate(store, request.headers.authorization))
          throw new DemoDomainError('登录已失效，请重新登录', 401)
        const receiptKey = `${identity.account.id}:${role}:${key}`
        const fingerprint = JSON.stringify(command)
        const previous = store.receipts[receiptKey]
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw new DemoDomainError('操作标识已用于其他内容', 409)
          if (previous.datasetId !== store.marketplace.datasetId)
            throw new DemoDomainError('演示场景已重置，请刷新后重新操作', 409)
          return { state: snapshot(role, identity), orderIds: previous.orderIds }
        }
        const next = structuredClone(store)
        const orderIds = applyDemoCommand(
          next.marketplace,
          role,
          ['createProduct', 'editProduct'].includes(command.type)
            ? normalizeProductVideo(
                normalizeProductImages(command, next, identity.account.id),
                next,
                identity.account.id,
              )
            : command.type === 'submitReview'
              ? normalizeReviewImages(command, next, identity.account.id)
              : command,
          randomUUID,
          identity.actor,
        )
        next.receipts[receiptKey] = { fingerprint, orderIds, datasetId: next.marketplace.datasetId }
        await persist(next)
        store = next
        return { state: snapshot(role, identity), orderIds }
      })
      send(200, result)
    } catch (error) {
      if (!(error instanceof DemoDomainError)) console.error('演示服务操作失败：', error)
      send(error instanceof DemoDomainError ? error.status : 500, {
        message:
          error instanceof DemoDomainError ? error.message : '演示数据暂时无法保存，请稍后重试',
        ...(error instanceof DemoDomainError &&
        path === '/api/demo/commands' &&
        identity &&
        identity.role === role &&
        ['user', 'merchant'].includes(role)
          ? { state: snapshot(role, identity) }
          : {}),
      })
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolve)
  })
  return {
    server,
    url: `http://${host}:${server.address().port}`,
    close: async () => {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
      await queue
    },
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '8787' },
      data: { type: 'string', default: '.tools/demo/marketplace.json' },
    },
  })
  const dataFile = resolve(values.data)
  const app = await startDemoServer({ dataFile, port: Number(values.port) })
  console.log(
    `星屿本地联动服务：${app.url}\n演示数据：${dataFile}\n仅用于本机模拟交易，不连接真实支付或物流。`,
  )
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await app.close()
      process.exit(0)
    })
}
