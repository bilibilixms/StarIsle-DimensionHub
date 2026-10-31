export type DemoRole = 'user' | 'merchant'
export type DemoVariant = 'standard' | 'gift'
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
export interface DemoRecipient {
  name: string
  phone: string
  address: string
}
export type DemoOrderStatus = '待发货' | '待收货' | '已完成'
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
  buyerId: string
  recipient: DemoRecipient
  createdAt: string
  shippedAt?: string
  completedAt?: string
  carrier?: string
  tracking?: string
}
export interface DemoMarketplace {
  version: 1
  datasetId: string
  revision: number
  products: DemoProduct[]
  orders: DemoOrder[]
  shop: { name: string; description: string }
}
export interface DemoCheckoutLine {
  productId: string
  variant: DemoVariant
  quantity: number
  expectedPrice: number
}
export interface DemoCommand {
  type: string
  [key: string]: unknown
}
export const DEMO_BUYER_ID = 'demo-user'
export const DEMO_RECIPIENT: DemoRecipient = {
  name: '小星同学',
  phone: '13800000000',
  address: '上海市 星屿路 1 号（演示地址）',
}
export class DemoDomainError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new DemoDomainError(`请填写有效的${label}`)
  return value.trim()
}
export function validateRecipient(value: unknown): DemoRecipient {
  if (!value || typeof value !== 'object') throw new DemoDomainError('请填写演示收货信息')
  const recipient = value as Record<string, unknown>
  const phone = text(recipient.phone, '手机号', 11)
  if (!/^1\d{10}$/.test(phone)) throw new DemoDomainError('请填写 11 位演示手机号')
  return {
    name: text(recipient.name, '收货人', 30),
    phone,
    address: text(recipient.address, '收货地址', 200),
  }
}
export function money(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, '')
}
export function variantPrice(product: DemoProduct, variant: DemoVariant): number {
  return product.price + (variant === 'gift' ? 3000 : 0)
}

// The service is the only writer. Clients receive projections of this one order list.
export function applyDemoCommand(
  state: DemoMarketplace,
  role: DemoRole,
  command: DemoCommand,
  makeId: () => string,
): string[] {
  const userCommands = ['checkout', 'receive']
  const merchantCommands = [
    'createProduct',
    'editProduct',
    'toggleProduct',
    'editShop',
    'ship',
    'reset',
  ]
  if (!(role === 'user' ? userCommands : merchantCommands).includes(command.type))
    throw new DemoDomainError('当前演示角色不能执行此操作', 403)
  const ids: string[] = []
  if (command.type === 'checkout') {
    if (command.datasetId && command.datasetId !== state.datasetId)
      throw new DemoDomainError('演示场景已重置，请刷新后重新确认', 409)
    const recipient = validateRecipient(command.recipient)
    if (!Array.isArray(command.items) || !command.items.length || command.items.length > 100)
      throw new DemoDomainError('请先选择商品')
    const totals = new Map<string, number>()
    const lines = command.items.map((raw: unknown) => {
      if (!raw || typeof raw !== 'object') throw new DemoDomainError('商品信息无效')
      const item = raw as DemoCheckoutLine
      if (
        !['standard', 'gift'].includes(item.variant) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1
      )
        throw new DemoDomainError('请选择有效的规格和数量')
      const product = state.products.find(
        (product) => product.id === item.productId && product.published,
      )
      if (!product) throw new DemoDomainError('商品已下架，请刷新后重新选择', 409)
      if (item.expectedPrice !== variantPrice(product, item.variant))
        throw new DemoDomainError('商品价格已变化，请刷新后重新确认', 409)
      totals.set(product.id, (totals.get(product.id) || 0) + item.quantity)
      return { item, product }
    })
    for (const [id, quantity] of totals) {
      if (quantity > state.products.find((product) => product.id === id)!.stock)
        throw new DemoDomainError('商品库存不足，请刷新后重新选择', 409)
    }
    for (const { item, product } of lines) {
      const id = `XY${makeId()}`
      product.stock -= item.quantity
      product.sold += item.quantity
      state.orders.unshift({
        id,
        productId: product.id,
        title: product.title,
        cover: product.cover,
        variant: item.variant === 'gift' ? '礼盒版' : '标准版',
        quantity: item.quantity,
        amount: variantPrice(product, item.variant) * item.quantity,
        status: '待发货',
        buyer: DEMO_RECIPIENT.name,
        buyerId: DEMO_BUYER_ID,
        recipient: { ...recipient },
        createdAt: new Date().toLocaleString('zh-CN'),
      })
      ids.push(id)
    }
  } else if (command.type === 'ship' || command.type === 'receive') {
    const order = state.orders.find((order) => order.id === command.id)
    if (!order) throw new DemoDomainError('订单不存在', 404)
    if (command.type === 'ship') {
      if (order.status !== '待发货') throw new DemoDomainError('该订单当前无法发货', 409)
      const carrier = text(command.carrier, '物流公司', 30)
      const tracking = typeof command.tracking === 'string' ? command.tracking.trim() : ''
      if (!/^[a-zA-Z0-9]{8,24}$/.test(tracking))
        throw new DemoDomainError('请填写 8–24 位字母或数字物流单号')
      Object.assign(order, {
        status: '待收货',
        carrier,
        tracking,
        shippedAt: new Date().toLocaleString('zh-CN'),
      })
    } else {
      if (order.buyerId !== DEMO_BUYER_ID) throw new DemoDomainError('只能确认自己的订单', 403)
      if (order.status !== '待收货') throw new DemoDomainError('仅待收货订单可以确认收货', 409)
      Object.assign(order, { status: '已完成', completedAt: new Date().toLocaleString('zh-CN') })
    }
  } else if (command.type === 'createProduct' || command.type === 'editProduct') {
    const title = text(command.title, '商品名称（最多 60 字）', 60)
    if (
      typeof command.price !== 'string' ||
      !/^\d{1,6}(\.\d{1,2})?$/.test(command.price) ||
      Number(command.price) <= 0 ||
      typeof command.stock !== 'string' ||
      !/^\d{1,6}$/.test(command.stock)
    )
      throw new DemoDomainError('请填写有效价格和整数库存')
    const fields = {
      title,
      price: Math.round(Number(command.price) * 100),
      stock: Number(command.stock),
    }
    if (command.type === 'editProduct') {
      const product = state.products.find((product) => product.id === command.id)
      if (!product) throw new DemoDomainError('商品不存在', 404)
      Object.assign(product, fields)
    } else {
      if (command.cover !== DEMO_ASSETS.hero && command.cover !== DEMO_ASSETS.figurine)
        throw new DemoDomainError('请选择演示商品图片')
      state.products.unshift({
        id: `product-${makeId()}`,
        ...fields,
        subtitle: '来自星屿小店的新心意',
        sold: 0,
        published: true,
        cover: command.cover,
        category: '周边',
        tag: '新作上架',
      })
    }
  } else if (command.type === 'toggleProduct') {
    const product = state.products.find((product) => product.id === command.id)
    if (!product) throw new DemoDomainError('商品不存在', 404)
    product.published = !product.published
  } else if (command.type === 'editShop') {
    state.shop = {
      name: text(command.name, '店铺名称（最多 20 字）', 20),
      description: text(command.description, '店铺介绍（最多 50 字）', 50),
    }
  } else if (command.type === 'reset') {
    state.datasetId = makeId()
    state.products = DEMO_PRODUCTS.map((product) => ({ ...product }))
    state.orders = []
    state.shop = { name: '星屿周边馆', description: '认真收藏，每一份热爱' }
  }
  state.revision += 1
  return ids
}

export function createDemoMarketplace(datasetId: string): DemoMarketplace {
  return {
    version: 1,
    datasetId,
    revision: 0,
    products: DEMO_PRODUCTS.map((product) => ({ ...product })),
    orders: [],
    shop: { name: '星屿周边馆', description: '认真收藏，每一份热爱' },
  }
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
