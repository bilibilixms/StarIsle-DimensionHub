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
  DEMO_BUYER_ID,
} from '../packages/shared/src/demo-domain.ts'

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
  function snapshot(role) {
    const state = structuredClone(store.marketplace)
    if (role === 'user')
      state.orders = state.orders.filter((order) => order.buyerId === DEMO_BUYER_ID)
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
        'Content-Type, X-Demo-Role, X-Idempotency-Key',
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
    const role = request.headers['x-demo-role']
    if (role !== 'user' && role !== 'merchant') return send(400, { message: '请选择演示角色' })
    try {
      if (request.method === 'GET' && path === '/api/demo/state') {
        await queue
        return send(200, { state: snapshot(role) })
      }
      if (request.method !== 'POST' || path !== '/api/demo/commands')
        return send(404, { message: '接口不存在' })
      if (!request.headers['content-type']?.startsWith('application/json'))
        return send(415, { message: '请使用 JSON 请求' })
      const key = request.headers['x-idempotency-key']
      if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(key))
        return send(400, { message: '操作标识无效，请重新操作' })
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
      if (
        !command ||
        typeof command !== 'object' ||
        Array.isArray(command) ||
        typeof command.type !== 'string'
      )
        return send(400, { message: '操作内容无效' })
      const result = await transaction(async () => {
        const receiptKey = `${role}:${key}`
        const fingerprint = JSON.stringify(command)
        const previous = store.receipts[receiptKey]
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw new DemoDomainError('操作标识已用于其他内容', 409)
          if (previous.datasetId !== store.marketplace.datasetId)
            throw new DemoDomainError('演示场景已重置，请刷新后重新操作', 409)
          return { state: snapshot(role), orderIds: previous.orderIds }
        }
        const next = structuredClone(store)
        const orderIds = applyDemoCommand(next.marketplace, role, command, randomUUID)
        next.receipts[receiptKey] = { fingerprint, orderIds, datasetId: next.marketplace.datasetId }
        await persist(next)
        store = next
        return { state: snapshot(role), orderIds }
      })
      send(200, result)
    } catch (error) {
      if (!(error instanceof DemoDomainError)) console.error('演示服务操作失败：', error)
      send(error instanceof DemoDomainError ? error.status : 500, {
        message:
          error instanceof DemoDomainError ? error.message : '演示数据暂时无法保存，请稍后重试',
        ...(error instanceof DemoDomainError ? { state: snapshot(role) } : {}),
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
