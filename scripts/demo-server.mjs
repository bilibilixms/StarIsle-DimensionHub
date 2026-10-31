import { createServer } from 'node:http'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
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
} from '../packages/shared/src/demo-domain.ts'
import { createDemoAuth, authenticate, applyAuth } from './demo-auth.mjs'

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
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      response.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Demo-Role, X-Idempotency-Key, Authorization',
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
      if (request.method === 'GET' && path === '/api/demo/state') {
        if (request.headers.authorization && !identity)
          throw new DemoDomainError('登录已失效，请重新登录', 401)
        if (!['user', 'merchant'].includes(role)) throw new DemoDomainError('请选择演示角色')
        if (role === 'merchant' && !identity) throw new DemoDomainError('请先登录商家账号', 401)
        if (identity && identity.role !== role) throw new DemoDomainError('请登录对应身份', 403)
        await queue
        return send(200, { state: snapshot(role, identity) })
      }
      const authAction = /^\/api\/demo\/auth\/(register|login|logout)$/.exec(path)?.[1]
      if (request.method !== 'POST' || (path !== '/api/demo/commands' && !authAction))
        return send(404, { message: '接口不存在' })
      if (!request.headers['content-type']?.startsWith('application/json'))
        return send(415, { message: '请使用 JSON 请求' })
      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > 65536) return send(413, { message: '请求内容过大' })
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
      if (identity.role !== role) throw new DemoDomainError('请登录对应身份', 403)
      if (typeof command.type !== 'string') throw new DemoDomainError('操作内容无效')
      const key = request.headers['x-idempotency-key']
      if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(key))
        return send(400, { message: '操作标识无效，请重新操作' })
      const result = await transaction(async () => {
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
          command,
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
        identity.role === role
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
