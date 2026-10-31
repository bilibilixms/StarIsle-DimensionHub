import {
  DEMO_BUYER_ID,
  DEMO_RECIPIENT,
  variantPrice,
  validateRecipient,
  validateDemoStock,
  type DemoRole,
  type DemoVariant,
  type DemoProduct,
  type DemoOrder,
  type DemoMarketplace,
  type DemoCheckoutLine,
  type DemoCommand,
  type DemoRecipient,
} from './demo-domain'
export {
  DEMO_ASSETS,
  DEMO_PRODUCTS,
  money,
  variantPrice,
  stockMessage,
  LOW_STOCK_LIMIT,
} from './demo-domain'
export type { DemoProduct, DemoOrder, DemoOrderStatus, DemoRecipient } from './demo-domain'

export interface DemoCartItem {
  productId: string
  variant: DemoVariant
  quantity: number
  selected: boolean
}
export interface DemoState {
  version: 2
  favorites: string[]
  cart: DemoCartItem[]
  recipient: DemoRecipient
  orders: DemoOrder[]
  merchantOrders: DemoOrder[]
  products: DemoProduct[]
  shop: { name: string; description: string }
}
interface LocalData {
  version: 2
  favorites: string[]
  cart: DemoCartItem[]
  recipient: DemoRecipient
  marketplace?: DemoMarketplace
  pending: Record<string, string>
}
export interface DemoCheckout {
  type: 'checkout'
  source: 'cart' | 'buy'
  items: DemoCheckoutLine[]
  recipient: DemoRecipient
  datasetId?: string
  [key: string]: unknown
}
let activeRole: DemoRole = 'user'
const base = (import.meta.env.VITE_DEMO_API_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
export function setDemoRole(role: DemoRole) {
  activeRole = role
}
function key() {
  return `starisle.linked-demo.v2.${activeRole}`
}
function load(): LocalData {
  const stored = uni.getStorageSync(key()) as LocalData | undefined
  if (stored?.version === 2) return stored
  const legacy = uni.getStorageSync('starisle.visual-demo.v1') as Partial<DemoState> | undefined
  return {
    version: 2,
    favorites: Array.isArray(legacy?.favorites) ? legacy.favorites : [],
    cart: Array.isArray(legacy?.cart) ? legacy.cart : [],
    recipient: { ...DEMO_RECIPIENT },
    pending: {},
  }
}
function save(data: LocalData): DemoState {
  uni.setStorageSync(key(), data)
  return getDemoState()
}
export function getDemoState(): DemoState {
  const data = load()
  return {
    version: 2,
    favorites: data.favorites,
    cart: data.cart,
    recipient: data.recipient,
    products: data.marketplace?.products || [],
    orders: data.marketplace?.orders.filter((order) => order.buyerId === DEMO_BUYER_ID) || [],
    merchantOrders: activeRole === 'merchant' ? data.marketplace?.orders || [] : [],
    shop: data.marketplace?.shop || { name: '星屿周边馆', description: '认真收藏，每一份热爱' },
  }
}
function merge(marketplace: DemoMarketplace): DemoState {
  const data = load()
  if (
    !data.marketplace ||
    data.marketplace.datasetId !== marketplace.datasetId ||
    data.marketplace.revision <= marketplace.revision
  ) {
    data.marketplace = marketplace
    const ids = new Set(marketplace.products.map((product) => product.id))
    data.cart = data.cart.filter((item) => ids.has(item.productId))
    data.favorites = data.favorites.filter((id) => ids.has(id))
  }
  return save(data)
}
class DemoRequestError extends Error {
  definite: boolean
  constructor(message: string, definite: boolean) {
    super(message)
    this.definite = definite
  }
}
function request(
  method: 'GET' | 'POST',
  command?: DemoCommand,
  operationId?: string,
): Promise<{ state: DemoMarketplace; orderIds?: string[] }> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${base}/api/demo/${method === 'GET' ? 'state' : 'commands'}`,
      method,
      data: command,
      header: {
        'Content-Type': 'application/json',
        'X-Demo-Role': activeRole,
        ...(operationId ? { 'X-Idempotency-Key': operationId } : {}),
      },
      timeout: 5000,
      success(response) {
        const body = response.data as {
          state?: DemoMarketplace
          message?: string
          orderIds?: string[]
        } | null
        if (response.statusCode >= 200 && response.statusCode < 300 && body?.state?.version === 1)
          resolve(body as { state: DemoMarketplace; orderIds?: string[] })
        else {
          if (body?.state?.version === 1) merge(body.state)
          reject(
            new DemoRequestError(
              body?.message || '演示服务暂时不可用，请稍后重试',
              response.statusCode < 500,
            ),
          )
        }
      },
      fail() {
        reject(new DemoRequestError('暂时无法连接演示服务，请检查服务后重试', false))
      },
    })
  })
}
export async function syncDemoState(): Promise<DemoState> {
  return merge((await request('GET')).state)
}
const inFlight = new Map<string, Promise<DemoState>>()
function mutate(
  command: DemoCommand,
  afterSuccess?: (data: LocalData) => void,
): Promise<DemoState> {
  const fingerprint = JSON.stringify(command)
  const existing = inFlight.get(fingerprint)
  if (existing) return existing
  const pending = execute(command, afterSuccess).finally(() => {
    inFlight.delete(fingerprint)
  })
  inFlight.set(fingerprint, pending)
  return pending
}
async function execute(
  command: DemoCommand,
  afterSuccess?: (data: LocalData) => void,
): Promise<DemoState> {
  const fingerprint = JSON.stringify(command)
  const data = load()
  const id = data.pending[fingerprint] || `op-${Date.now()}-${Math.random().toString(36).slice(2)}`
  data.pending[fingerprint] = id
  save(data)
  try {
    const response = await request('POST', command, id)
    merge(response.state)
    const latest = load()
    afterSuccess?.(latest)
    delete latest.pending[fingerprint]
    return save(latest)
  } catch (error) {
    // Retain the ID after an uncertain response so a retry cannot duplicate a paid order.
    if (error instanceof DemoRequestError && error.definite) {
      const latest = load()
      delete latest.pending[fingerprint]
      save(latest)
    }
    throw error
  }
}
export function toggleFavorite(id: string): DemoState {
  const data = load()
  data.favorites = data.favorites.includes(id)
    ? data.favorites.filter((item) => item !== id)
    : [...data.favorites, id]
  return save(data)
}
export function editDemoRecipient(recipient: DemoRecipient): DemoState {
  const data = load()
  data.recipient = validateRecipient(recipient)
  return save(data)
}
export function resetLocalDemoState(): DemoState {
  const data = load()
  data.cart = []
  data.favorites = []
  data.recipient = { ...DEMO_RECIPIENT }
  return save(data)
}
export function resetDemoState(): Promise<DemoState> {
  return mutate({ type: 'reset' })
}
export function addToCart(productId: string, variant: DemoVariant, quantity: number): DemoState {
  const data = load()
  const product = data.marketplace?.products.find((item) => item.id === productId && item.published)
  if (!product || !Number.isInteger(quantity) || quantity < 1)
    throw new Error('请选择有效的商品数量')
  const existingQuantity = data.cart
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + item.quantity, 0)
  if (existingQuantity + quantity > product.stock) throw new Error('已超过可选库存数量')
  const item = data.cart.find((item) => item.productId === productId && item.variant === variant)
  if (item) item.quantity += quantity
  else data.cart.push({ productId, variant, quantity, selected: true })
  return save(data)
}
export function updateCart(
  productId: string,
  variant: string,
  change: 'plus' | 'minus' | 'select' | 'remove',
): DemoState {
  const data = load()
  const item = data.cart.find((item) => item.productId === productId && item.variant === variant)
  if (!item) return getDemoState()
  if (change === 'remove') data.cart = data.cart.filter((entry) => entry !== item)
  else if (change === 'select') item.selected = !item.selected
  else if (change === 'minus') item.quantity = Math.max(1, item.quantity - 1)
  else {
    const product = data.marketplace?.products.find(
      (product) => product.id === productId && product.published,
    )
    const total = data.cart
      .filter((entry) => entry.productId === productId)
      .reduce((sum, entry) => sum + entry.quantity, 0)
    if (!product || total >= product.stock) throw new Error('已达到库存上限或商品已下架')
    item.quantity += 1
  }
  return save(data)
}
function line(productId: string, variant: DemoVariant, quantity: number): DemoCheckoutLine {
  const product = getDemoState().products.find((product) => product.id === productId)
  if (!product) throw new Error('商品已下架，请重新选择')
  return { productId, variant, quantity, expectedPrice: variantPrice(product, variant) }
}
function pendingCheckout(
  source: 'cart' | 'buy',
  items: Pick<DemoCheckoutLine, 'productId' | 'variant' | 'quantity'>[],
): DemoCheckout | undefined {
  const signature = (lines: Pick<DemoCheckoutLine, 'productId' | 'variant' | 'quantity'>[]) =>
    JSON.stringify(
      lines.map(({ productId, variant, quantity }) => ({ productId, variant, quantity })),
    )
  const data = load()
  for (const pending of Object.keys(data.pending)) {
    const previous = JSON.parse(pending) as DemoCheckout
    if (
      previous.type === 'checkout' &&
      previous.source === source &&
      signature(previous.items) === signature(items)
    )
      return previous
  }
}
export function pendingBuyCheckout(productId: string): DemoCheckout | undefined {
  return Object.keys(load().pending)
    .map((key) => JSON.parse(key) as DemoCheckout)
    .find(
      (checkout) =>
        checkout.type === 'checkout' &&
        checkout.source === 'buy' &&
        checkout.items[0]?.productId === productId,
    )
}
export function cartCheckoutIssue(state: DemoState): string {
  const chosen = state.cart.filter((item) => item.selected)
  if (pendingCheckout('cart', chosen)) return ''
  try {
    validateDemoStock(state.products, chosen)
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : '请检查商品库存'
  }
}
function prepareCheckout(source: 'cart' | 'buy', items: DemoCheckoutLine[]): DemoCheckout {
  const pending = pendingCheckout(source, items)
  if (pending) return pending
  const data = load()
  validateDemoStock(data.marketplace?.products || [], items)
  return {
    type: 'checkout',
    source,
    items,
    recipient: { ...data.recipient },
    datasetId: data.marketplace?.datasetId,
  }
}
export function prepareCartCheckout(): DemoCheckout {
  const chosen = getDemoState()
    .cart.filter((item) => item.selected)
    .map((item) => ({ ...item }))
  if (!chosen.length) throw new Error('请先选择商品')
  return prepareCheckout(
    'cart',
    chosen.map((item) => line(item.productId, item.variant, item.quantity)),
  )
}
export function prepareBuyCheckout(
  productId: string,
  variant: DemoVariant,
  quantity: number,
): DemoCheckout {
  return prepareCheckout('buy', [line(productId, variant, quantity)])
}
export function checkoutCart(checkout = prepareCartCheckout()): Promise<DemoState> {
  return mutate(checkout, (data) => {
    for (const bought of checkout.items) {
      const item = data.cart.find(
        (item) => item.productId === bought.productId && item.variant === bought.variant,
      )
      if (item) item.quantity -= bought.quantity
    }
    data.cart = data.cart.filter((item) => item.quantity > 0)
  })
}
export function buyDemoProduct(checkout: DemoCheckout): Promise<DemoState> {
  return mutate(checkout)
}
export function shipDemoOrder(id: string, carrier: string, tracking: string): Promise<DemoState> {
  return mutate({ type: 'ship', id, carrier, tracking })
}
export function receiveDemoOrder(id: string): Promise<DemoState> {
  return mutate({ type: 'receive', id })
}
export function editDemoProduct(
  id: string,
  title: string,
  price: string,
  stock?: string,
  expectedStock?: number,
): Promise<DemoState> {
  return mutate({ type: 'editProduct', id, title, price, stock, expectedStock })
}
export function toggleDemoProduct(id: string): Promise<DemoState> {
  return mutate({ type: 'toggleProduct', id })
}
export function createDemoProduct(
  title: string,
  price: string,
  stock: string,
  cover: string,
): Promise<DemoState> {
  return mutate({ type: 'createProduct', title, price, stock, cover })
}
export function editDemoShop(name: string, description: string): Promise<DemoState> {
  return mutate({ type: 'editShop', name, description })
}
