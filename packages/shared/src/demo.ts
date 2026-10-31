export interface DemoProduct {
  id: string
  title: string
  subtitle: string
  price: number
  cover: string
  category: '周边' | '画作'
  tag: string
  stock: number
  sold: number
  published: boolean
}
export interface DemoCartItem {
  productId: string
  variant: 'standard' | 'gift'
  quantity: number
  selected: boolean
}
export type DemoOrderStatus = '待发货' | '待收货' | '已完成' | '退款中' | '已退款'
export interface DemoOrder {
  id: string
  productId: string
  title: string
  cover: string
  variant: string
  quantity: number
  amount: number
  status: DemoOrderStatus
  buyer: string
  createdAt: string
  carrier?: string
  tracking?: string
}
export interface DemoState {
  version: 1
  favorites: string[]
  cart: DemoCartItem[]
  orders: DemoOrder[]
  merchantOrders: DemoOrder[]
  products: DemoProduct[]
  shop: { name: string; description: string }
}

export const DEMO_ASSETS = {
  hero: '/static/demo/star-island.jpg',
  figurine: '/static/demo/star-fairy.jpg',
}
export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 'star-fairy',
    title: '星之花旅人 · 樱粉手办',
    subtitle: '把一整片星光，收藏在身边',
    price: 12800,
    cover: DEMO_ASSETS.figurine,
    category: '周边',
    tag: '人气收藏',
    stock: 36,
    sold: 128,
    published: true,
  },
  {
    id: 'moon-letter',
    title: '月光来信 · 典藏艺术微喷',
    subtitle: '属于你的小小梦境',
    price: 6800,
    cover: DEMO_ASSETS.hero,
    category: '画作',
    tag: '画师原创',
    stock: 50,
    sold: 86,
    published: true,
  },
  {
    id: 'fairy-gift',
    title: '星之花旅人 · 心意礼盒',
    subtitle: '送给同样热爱星星的你',
    price: 15800,
    cover: DEMO_ASSETS.figurine,
    category: '周边',
    tag: '赠礼之选',
    stock: 18,
    sold: 62,
    published: true,
  },
  {
    id: 'island-card',
    title: '云上星屿 · 收藏明信片',
    subtitle: '让每一次相遇都有回音',
    price: 1800,
    cover: DEMO_ASSETS.hero,
    category: '周边',
    tag: '新作上架',
    stock: 120,
    sold: 215,
    published: true,
  },
]
const KEY = 'starisle.visual-demo.v1'

export function money(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, '')
}
export function variantPrice(product: DemoProduct, variant: 'standard' | 'gift'): number {
  return product.price + (variant === 'gift' ? 3000 : 0)
}

function seed(): DemoState {
  const createOrder = (
    id: string,
    product: DemoProduct,
    quantity: number,
    status: DemoOrderStatus,
    buyer: string,
  ): DemoOrder => ({
    id,
    productId: product.id,
    title: product.title,
    cover: product.cover,
    variant: '标准版',
    quantity,
    amount: product.price * quantity,
    status,
    buyer,
    createdAt: '2026-10-29 14:20',
  })
  return {
    version: 1,
    favorites: [],
    cart: [],
    orders: [],
    products: DEMO_PRODUCTS.map((product) => ({ ...product })),
    merchantOrders: [
      createOrder('XY20261029008', DEMO_PRODUCTS[0]!, 1, '待发货', '小星同学'),
      createOrder('XY20261029007', DEMO_PRODUCTS[1]!, 2, '待发货', '月见'),
      createOrder('XY20261028006', DEMO_PRODUCTS[2]!, 1, '退款中', '云朵收藏家'),
      createOrder('XY20261028005', DEMO_PRODUCTS[3]!, 3, '已完成', '橘子汽水'),
    ],
    shop: { name: '星屿周边馆', description: '认真收藏，每一份热爱' },
  }
}

export function getDemoState(): DemoState {
  const stored: unknown = uni.getStorageSync(KEY)
  if (stored && typeof stored === 'object' && (stored as DemoState).version === 1) {
    const candidate = stored as DemoState
    if (
      Array.isArray(candidate.products) &&
      Array.isArray(candidate.cart) &&
      Array.isArray(candidate.favorites) &&
      Array.isArray(candidate.orders) &&
      Array.isArray(candidate.merchantOrders) &&
      candidate.shop
    )
      return candidate
  }
  return seed()
}
function save(state: DemoState): DemoState {
  uni.setStorageSync(KEY, state)
  return state
}
export function resetDemoState(): DemoState {
  return save(seed())
}
export function toggleFavorite(id: string): DemoState {
  const state = getDemoState()
  state.favorites = state.favorites.includes(id)
    ? state.favorites.filter((item) => item !== id)
    : [...state.favorites, id]
  return save(state)
}
export function addToCart(
  productId: string,
  variant: 'standard' | 'gift',
  quantity: number,
): DemoState {
  const state = getDemoState()
  const product = state.products.find((item) => item.id === productId && item.published)
  if (!product || !Number.isInteger(quantity) || quantity < 1)
    throw new Error('请选择有效的商品数量')
  const existingQuantity = state.cart
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + item.quantity, 0)
  if (existingQuantity + quantity > product.stock) throw new Error('已超过可选库存数量')
  const item = state.cart.find((item) => item.productId === productId && item.variant === variant)
  if (item) item.quantity += quantity
  else state.cart.push({ productId, variant, quantity, selected: true })
  return save(state)
}
export function updateCart(
  productId: string,
  variant: string,
  change: 'plus' | 'minus' | 'select' | 'remove',
): DemoState {
  const state = getDemoState()
  const item = state.cart.find((item) => item.productId === productId && item.variant === variant)
  if (!item) return state
  if (change === 'remove') state.cart = state.cart.filter((entry) => entry !== item)
  else if (change === 'select') item.selected = !item.selected
  else if (change === 'minus') item.quantity = Math.max(1, item.quantity - 1)
  else {
    const product = state.products.find((product) => product.id === productId)
    const total = state.cart
      .filter((entry) => entry.productId === productId)
      .reduce((sum, entry) => sum + entry.quantity, 0)
    if (!product || total >= product.stock) throw new Error('已达到库存上限')
    item.quantity += 1
  }
  return save(state)
}
export function checkoutCart(): DemoState {
  const state = getDemoState()
  const chosen = state.cart.filter((item) => item.selected)
  if (!chosen.length) throw new Error('请先选择商品')
  for (const item of chosen) {
    const product = state.products.find(
      (product) => product.id === item.productId && product.published,
    )
    const quantity = chosen
      .filter((entry) => entry.productId === item.productId)
      .reduce((sum, entry) => sum + entry.quantity, 0)
    if (!product || quantity > product.stock) throw new Error('部分商品库存不足，请重新选择')
  }
  const timestamp = Date.now()
  chosen.forEach((item, index) => {
    const product = state.products.find((product) => product.id === item.productId)!
    product.stock -= item.quantity
    state.orders.unshift({
      id: `XY${timestamp}${index}`,
      productId: product.id,
      title: product.title,
      cover: product.cover,
      variant: item.variant === 'gift' ? '礼盒版' : '标准版',
      quantity: item.quantity,
      amount: variantPrice(product, item.variant) * item.quantity,
      status: '待发货',
      buyer: '小星同学',
      createdAt: new Date().toLocaleString('zh-CN'),
    })
  })
  state.cart = state.cart.filter((item) => !item.selected)
  return save(state)
}
export function buyDemoProduct(
  productId: string,
  variant: 'standard' | 'gift',
  quantity: number,
): DemoState {
  const state = getDemoState()
  const product = state.products.find((product) => product.id === productId && product.published)
  if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > product.stock)
    throw new Error('请选择库存范围内的数量')
  product.stock -= quantity
  state.orders.unshift({
    id: `XY${Date.now()}`,
    productId,
    title: product.title,
    cover: product.cover,
    variant: variant === 'gift' ? '礼盒版' : '标准版',
    quantity,
    amount: variantPrice(product, variant) * quantity,
    status: '待发货',
    buyer: '小星同学',
    createdAt: new Date().toLocaleString('zh-CN'),
  })
  return save(state)
}
export function shipDemoOrder(id: string, carrier: string, tracking: string): DemoState {
  const state = getDemoState()
  const order = state.merchantOrders.find((order) => order.id === id)
  if (!order || order.status !== '待发货') throw new Error('该订单当前无法发货')
  if (!carrier.trim() || !/^[a-zA-Z0-9]{8,24}$/.test(tracking.trim()))
    throw new Error('请填写物流公司和 8–24 位字母或数字单号')
  Object.assign(order, { status: '待收货', carrier: carrier.trim(), tracking: tracking.trim() })
  return save(state)
}
export function refundDemoOrder(id: string): DemoState {
  const state = getDemoState()
  const order = state.merchantOrders.find((order) => order.id === id)
  if (!order || order.status !== '退款中') throw new Error('该订单当前无需退款')
  order.status = '已退款'
  return save(state)
}
export function editDemoProduct(
  id: string,
  title: string,
  price: string,
  stock: string,
): DemoState {
  if (
    !title.trim() ||
    title.trim().length > 60 ||
    !/^\d{1,6}(\.\d{1,2})?$/.test(price) ||
    !/^\d{1,6}$/.test(stock)
  )
    throw new Error('请填写商品名称、有效价格和整数库存')
  const state = getDemoState()
  const product = state.products.find((product) => product.id === id)
  if (!product) throw new Error('商品不存在')
  const cents = Math.round(Number(price) * 100)
  if (cents <= 0) throw new Error('商品价格需要大于 0')
  Object.assign(product, { title: title.trim(), price: cents, stock: Number(stock) })
  return save(state)
}
export function toggleDemoProduct(id: string): DemoState {
  const state = getDemoState()
  const product = state.products.find((product) => product.id === id)
  if (product) product.published = !product.published
  return save(state)
}
export function createDemoProduct(
  title: string,
  price: string,
  stock: string,
  cover: string,
): DemoState {
  if (
    !title.trim() ||
    title.trim().length > 60 ||
    !/^\d{1,6}(\.\d{1,2})?$/.test(price) ||
    !/^\d{1,6}$/.test(stock)
  )
    throw new Error('请填写商品名称、有效价格和整数库存')
  const cents = Math.round(Number(price) * 100)
  if (cents <= 0) throw new Error('商品价格需要大于 0')
  const state = getDemoState()
  state.products.unshift({
    id: `product-${Date.now()}`,
    title: title.trim(),
    subtitle: '来自星屿小店的新心意',
    price: cents,
    stock: Number(stock),
    sold: 0,
    published: true,
    cover,
    category: '周边',
    tag: '新作上架',
  })
  return save(state)
}
export function editDemoShop(name: string, description: string): DemoState {
  if (!name.trim() || name.trim().length > 20) throw new Error('店铺名称需要为 1–20 个字符')
  const state = getDemoState()
  state.shop = { name: name.trim(), description: description.trim().slice(0, 50) }
  return save(state)
}
