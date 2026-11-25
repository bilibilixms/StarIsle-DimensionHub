export type DemoRole = 'user' | 'merchant'
export const DEMO_MERCHANT_VERIFICATION_CODE = '1234'
export type DemoVariant = string
export interface DemoSku {
  id: string
  name: string
  price: number
  stock: number
  sold: number
}
export type DemoShopStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'
export interface DemoProduct {
  id: string
  shopId?: string
  title: string
  subtitle: string
  price: number
  cover: string
  category: '周边' | '画作'
  tag: string
  tags?: string[]
  stock: number
  sold: number
  published: boolean
  adminHidden?: boolean
  adminReason?: string
  managementVersion?: number
  video?: string
  images?: string[]
  description?: string
  skus?: DemoSku[]
}
export function normalizeSearchText(value: string): string {
  const text = typeof value.normalize === 'function' ? value.normalize('NFKC') : value
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}
export function tagKey(value: string): string {
  return normalizeSearchText(value)
    .replace(/^[#＃]+/, '')
    .trim()
}
export function productTags(product: Pick<DemoProduct, 'tag' | 'tags'>): string[] {
  const values = [...(Array.isArray(product.tags) ? product.tags : []), product.tag]
  const result: string[] = []
  for (const value of values) {
    if (typeof value !== 'string' || !tagKey(value)) continue
    if (!result.some((tag) => tagKey(tag) === tagKey(value))) result.push(value.trim())
  }
  return result
}
export function productMatchesSearch(
  product: DemoProduct,
  keyword: string,
  shopName = '',
): boolean {
  const query = normalizeSearchText(keyword)
  if (!query) return true
  const tags = productTags(product).map(tagKey)
  if (/^[#＃]/.test(query)) return !!tagKey(query) && tags.includes(tagKey(query))
  return (
    normalizeSearchText(product.title).includes(query) ||
    normalizeSearchText(shopName).includes(query) ||
    tags.some((tag) => tag.includes(query))
  )
}
export function normalizeProductTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10)
    throw new DemoDomainError('每件商品最多设置 10 个标签')
  const result: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') throw new DemoDomainError('商品标签无效')
    const tag = raw.normalize('NFKC').trim().replace(/^#+/, '').trim().replace(/\s+/g, ' ')
    if (!tag || Array.from(tag).length > 12) throw new DemoDomainError('每个标签请填写 1–12 字')
    if (!result.some((existing) => tagKey(existing) === tagKey(tag))) result.push(tag)
  }
  return result
}
export interface DemoRecipient {
  name: string
  phone: string
  address: string
}
export type DemoOrderStatus = '待发货' | '待收货' | '已完成' | '退款中' | '已退款'
export interface DemoOrderItem {
  productId: string
  title: string
  cover: string
  variant: string
  quantity: number
  unitPrice: number
  amount: number
  skuId?: string
}
export interface DemoReview {
  id: string
  orderId: string
  buyerId: string
  shopId: string
  productId: string
  itemKey: string
  productTitle: string
  variant: string
  author: string
  rating: number
  content: string
  images: string[]
  createdAt: string
  reply?: { content: string; createdAt: string }
}
export type DemoReviewView = Omit<DemoReview, 'buyerId' | 'orderId'> & {
  orderId?: string
  refunded?: boolean
}
export function reviewItemKey(
  item: Pick<DemoOrderItem, 'productId' | 'skuId' | 'variant'>,
): string {
  return JSON.stringify([item.productId, item.skuId || item.variant])
}
export interface DemoRefund {
  id?: string
  type?: 'REFUND_ONLY' | 'RETURN_REFUND'
  originalStatus?: '待发货' | '待收货' | '已完成'
  status: 'PENDING' | 'WAIT_RETURN' | 'WAIT_RECEIPT' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  reason: string
  requestedAt: string
  resolvedAt?: string
  reply?: string
  returnAddress?: DemoRecipient
  returnCarrier?: string
  returnTracking?: string
  returnedAt?: string
  acceptedAt?: string
  restocked?: boolean
}
export const REFUND_STATUS_LABELS: Record<DemoRefund['status'], string> = {
  PENDING: '等待商家审核',
  WAIT_RETURN: '等待用户退货',
  WAIT_RECEIPT: '等待商家收货',
  APPROVED: '退款成功',
  REJECTED: '商家已拒绝',
  CANCELLED: '已撤销',
}
export interface DemoOrder {
  id: string
  shopId?: string
  shopName?: string
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
  refund?: DemoRefund
  refundHistory?: DemoRefund[]
  shippedAt?: string
  completedAt?: string
  carrier?: string
  tracking?: string
  items?: DemoOrderItem[]
}
export function orderItems(order: DemoOrder): DemoOrderItem[] {
  return order.items?.length
    ? order.items
    : [
        {
          productId: order.productId,
          title: order.title,
          cover: order.cover,
          variant: order.variant,
          quantity: order.quantity,
          unitPrice: order.amount / order.quantity,
          amount: order.amount,
        },
      ]
}
export interface DemoMarketplace {
  version: 1
  datasetId: string
  revision: number
  products: DemoProduct[]
  orders: DemoOrder[]
  reviews?: DemoReview[]
  shop: Omit<DemoShop, 'id'>
  shops?: DemoShop[]
}
export interface DemoShop {
  id: string
  name: string
  description: string
  status?: DemoShopStatus
  reason?: string
  ownerDisabled?: boolean
  managementVersion?: number
}
export interface DemoActor {
  id: string
  nickname: string
  shopId?: string
}
export const DEMO_SHOP_ID = 'demo-shop'
export function productShopId(product: { shopId?: string }): string {
  return product.shopId || DEMO_SHOP_ID
}
export function marketplaceShops(state: DemoMarketplace): DemoShop[] {
  return state.shops || [{ id: DEMO_SHOP_ID, ...state.shop }]
}
export function shopCanSell(state: DemoMarketplace, id: string): boolean {
  const shop = marketplaceShops(state).find((shop) => shop.id === id)
  return !!shop && (!shop.status || shop.status === 'ACTIVE') && !shop.ownerDisabled
}
export function productVisible(state: DemoMarketplace, product: DemoProduct): boolean {
  return product.published && !product.adminHidden && shopCanSell(state, productShopId(product))
}
export interface DemoCheckoutLine {
  productId: string
  variant: DemoVariant
  quantity: number
  expectedPrice: number
  variantName?: string
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
  return productVariants(product).find((sku) => sku.id === variant)?.price ?? product.price
}
export function productVariants(product: DemoProduct): DemoSku[] {
  return (
    product.skus || [
      { id: 'standard', name: '标准版', price: product.price, stock: product.stock, sold: 0 },
      { id: 'gift', name: '礼盒版', price: product.price + 3000, stock: product.stock, sold: 0 },
    ]
  )
}
export function variantName(product: DemoProduct, variant: string): string {
  return productVariants(product).find((sku) => sku.id === variant)?.name || '规格已调整'
}
export function variantStock(product: DemoProduct, variant: string): number {
  return productVariants(product).find((sku) => sku.id === variant)?.stock || 0
}
export const LOW_STOCK_LIMIT = 5
export function stockMessage(stock: number): string {
  if (stock <= 0) return '已售罄'
  return stock <= LOW_STOCK_LIMIT ? `库存紧张，仅剩 ${stock} 件` : `库存 ${stock} 件`
}
export function validateDemoStock(
  products: DemoProduct[],
  items: (Pick<DemoCheckoutLine, 'productId' | 'quantity'> & { variant?: string })[],
): void {
  const totals = new Map<string, number>()
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1)
      throw new DemoDomainError('请选择有效的商品数量')
    const product = products.find((product) => product.id === item.productId)
    if (item.variant && product && !productVariants(product).some((sku) => sku.id === item.variant))
      throw new DemoDomainError('商品规格已调整，请重新选择', 409)
    if (product?.skus && !item.variant) throw new DemoDomainError('请选择商品规格')
    const key = product?.skus ? `${item.productId}:${item.variant}` : item.productId
    const quantity = (totals.get(key) || 0) + item.quantity
    if (!Number.isSafeInteger(quantity)) throw new DemoDomainError('请选择有效的商品数量')
    totals.set(key, quantity)
  }
  for (const [id, quantity] of totals) {
    const product = products.find(
      (product) =>
        (product.id === id || (product.skus && id.startsWith(`${product.id}:`))) &&
        product.published &&
        !product.adminHidden,
    )
    if (!product) throw new DemoDomainError('商品已下架，请重新选择', 409)
    const sku = product.skus?.find((sku) => `${product.id}:${sku.id}` === id)
    const stock = sku?.stock ?? product.stock
    if (quantity > stock)
      throw new DemoDomainError(
        `「${product.title}${sku ? `（${sku.name}）` : ''}」库存不足，仅剩 ${stock} 件`,
        409,
      )
  }
}

// The service is the only writer. Clients receive projections of this one order list.
export function applyDemoCommand(
  state: DemoMarketplace,
  role: DemoRole,
  command: DemoCommand,
  makeId: () => string,
  actor: DemoActor = { id: DEMO_BUYER_ID, nickname: DEMO_RECIPIENT.name, shopId: DEMO_SHOP_ID },
): string[] {
  const userCommands = [
    'checkout',
    'receive',
    'requestRefund',
    'cancelRefund',
    'returnRefund',
    'submitReview',
  ]
  const merchantCommands = [
    'createProduct',
    'editProduct',
    'toggleProduct',
    'editShop',
    'ship',
    'replyReview',
    'resolveRefund',
    'confirmRefundReturn',
    'reset',
    'submitShopReview',
  ]
  if (!(role === 'user' ? userCommands : merchantCommands).includes(command.type))
    throw new DemoDomainError('当前演示角色不能执行此操作', 403)
  const ids: string[] = []
  const shopId = actor.shopId || DEMO_SHOP_ID
  const owns = (item: { shopId?: string }) => productShopId(item) === shopId
  if (
    role === 'merchant' &&
    ['createProduct', 'editProduct', 'toggleProduct', 'reset'].includes(command.type) &&
    !shopCanSell(state, shopId)
  )
    throw new DemoDomainError('店铺尚未通过审核或已暂停，暂不能管理商品', 403)
  if (command.type === 'checkout') {
    if (command.datasetId && command.datasetId !== state.datasetId)
      throw new DemoDomainError('演示场景已重置，请刷新后重新确认', 409)
    const recipient = validateRecipient(command.recipient)
    if (!Array.isArray(command.items) || !command.items.length || command.items.length > 100)
      throw new DemoDomainError('请先选择商品')
    const lines = command.items.map((raw: unknown) => {
      if (!raw || typeof raw !== 'object') throw new DemoDomainError('商品信息无效')
      const item = raw as DemoCheckoutLine
      if (
        typeof item.variant !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(item.variant) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1
      )
        throw new DemoDomainError('请选择有效的规格和数量')
      const product = state.products.find(
        (product) => product.id === item.productId && productVisible(state, product),
      )
      if (!product) throw new DemoDomainError('商品已下架，请刷新后重新选择', 409)
      if (!productVariants(product).some((sku) => sku.id === item.variant))
        throw new DemoDomainError('商品规格已调整，请重新选择', 409)
      if (item.variantName !== undefined && item.variantName !== variantName(product, item.variant))
        throw new DemoDomainError('商品规格名称已变化，请刷新后重新确认', 409)
      if (item.expectedPrice !== variantPrice(product, item.variant))
        throw new DemoDomainError('商品价格已变化，请刷新后重新确认', 409)
      return { item, product }
    })
    validateDemoStock(
      state.products,
      lines.map(({ item }) => item),
    )
    const groups = new Map<string, DemoOrderItem[]>()
    for (const { item, product } of lines) {
      const sku = product.skus?.find((sku) => sku.id === item.variant)
      if (sku) {
        sku.stock -= item.quantity
        sku.sold += item.quantity
        product.stock = product.skus!.reduce((sum, sku) => sum + sku.stock, 0)
      } else product.stock -= item.quantity
      product.sold += item.quantity
      const shopId = productShopId(product)
      const items = groups.get(shopId) || []
      const variant = variantName(product, item.variant)
      const previous = items.find(
        (line) => line.productId === product.id && line.variant === variant,
      )
      if (previous) {
        previous.quantity += item.quantity
        previous.amount += item.expectedPrice * item.quantity
      } else
        items.push({
          productId: product.id,
          title: product.title,
          cover: product.cover,
          variant,
          quantity: item.quantity,
          unitPrice: item.expectedPrice,
          amount: item.expectedPrice * item.quantity,
          ...(sku ? { skuId: sku.id } : {}),
        })
      groups.set(shopId, items)
    }
    for (const [shopId, items] of groups) {
      const id = `XY${makeId()}`
      const first = items[0]!
      state.orders.unshift({
        id,
        shopId,
        shopName:
          marketplaceShops(state).find((shop) => shop.id === shopId)?.name || state.shop.name,
        productId: first.productId,
        title: first.title,
        cover: first.cover,
        variant: first.variant,
        quantity: items.reduce((sum, item) => sum + item.quantity, 0),
        amount: items.reduce((sum, item) => sum + item.amount, 0),
        items,
        status: '待发货',
        buyer: actor.nickname,
        buyerId: actor.id,
        recipient: { ...recipient },
        createdAt: new Date().toLocaleString('zh-CN'),
      })
      ids.push(id)
    }
  } else if (command.type === 'submitReview') {
    const order = state.orders.find((order) => order.id === command.orderId)
    if (!order) throw new DemoDomainError('订单不存在', 404)
    if (order.buyerId !== actor.id) throw new DemoDomainError('只能评价自己的订单', 403)
    if (order.status !== '已完成') throw new DemoDomainError('请确认收货且售后结束后再评价', 409)
    const item = orderItems(order).find((item) => reviewItemKey(item) === command.itemKey)
    if (!item) throw new DemoDomainError('该商品不在本订单中', 400)
    if (
      state.reviews?.some(
        (review) => review.orderId === order.id && review.itemKey === command.itemKey,
      )
    )
      throw new DemoDomainError('该订单商品已评价，请勿重复提交', 409)
    if (
      !Number.isInteger(command.rating) ||
      Number(command.rating) < 1 ||
      Number(command.rating) > 5
    )
      throw new DemoDomainError('请选择 1–5 星评分')
    const content = text(command.content, '评价内容（最多 500 字）', 500)
    const images = command.images ?? []
    if (
      !Array.isArray(images) ||
      images.length > 3 ||
      new Set(images).size !== images.length ||
      images.some(
        (image) =>
          typeof image !== 'string' || !/^\/api\/demo\/images\/[a-f0-9-]{36}\.jpg$/.test(image),
      )
    )
      throw new DemoDomainError('评价最多上传 3 张有效图片')
    const nickname = Array.from(actor.nickname || '用户')
    ;(state.reviews ||= []).unshift({
      id: makeId(),
      orderId: order.id,
      buyerId: actor.id,
      shopId: productShopId(order),
      productId: item.productId,
      itemKey: reviewItemKey(item),
      productTitle: item.title,
      variant: item.variant,
      author: nickname[0] + '***' + (nickname.length > 1 ? nickname[nickname.length - 1] : ''),
      rating: Number(command.rating),
      content,
      images: [...images],
      createdAt: new Date().toLocaleString('zh-CN'),
    })
  } else if (command.type === 'replyReview') {
    const review = state.reviews?.find((review) => review.id === command.id)
    if (!review) throw new DemoDomainError('评价不存在', 404)
    if (!owns(review)) throw new DemoDomainError('只能回复本店评价', 403)
    if (review.reply) throw new DemoDomainError('这条评价已经回复', 409)
    review.reply = {
      content: text(command.content, '回复内容（最多 500 字）', 500),
      createdAt: new Date().toLocaleString('zh-CN'),
    }
  } else if (
    [
      'requestRefund',
      'replyReview',
      'resolveRefund',
      'cancelRefund',
      'returnRefund',
      'confirmRefundReturn',
    ].includes(command.type)
  ) {
    const order = state.orders.find((entry) => entry.id === command.id)
    if (!order) throw new DemoDomainError('订单不存在', 404)
    if (role === 'user' && order.buyerId !== actor.id)
      throw new DemoDomainError('只能处理自己的订单售后', 403)
    if (role === 'merchant' && !owns(order)) throw new DemoDomainError('只能处理本店退款', 403)
    const now = new Date().toLocaleString('zh-CN')
    if (command.type === 'requestRefund') {
      if (!['待发货', '待收货', '已完成'].includes(order.status))
        throw new DemoDomainError('当前订单不能重复申请售后', 409)
      const type = command.refundType ?? 'REFUND_ONLY'
      if (type !== 'REFUND_ONLY' && type !== 'RETURN_REFUND')
        throw new DemoDomainError('请选择售后类型')
      if (order.status === '待发货' && type === 'RETURN_REFUND')
        throw new DemoDomainError('未发货订单无需退货')
      const reason = text(command.reason, '退款原因（最多 200 字）', 200)
      if (order.refund) (order.refundHistory ||= []).push(structuredClone(order.refund))
      order.refund = {
        id: makeId(),
        type,
        originalStatus: order.status as DemoRefund['originalStatus'],
        status: 'PENDING',
        reason,
        requestedAt: now,
      }
      order.status = '退款中'
    } else {
      const refund = order.refund
      if (order.status !== '退款中' || !refund)
        throw new DemoDomainError('售后状态已变化，请刷新后重试', 409)
      if (command.refundId !== undefined && command.refundId !== refund.id)
        throw new DemoDomainError('售后申请已更新，请重新打开订单', 409)
      const originalStatus = refund.originalStatus || '待发货'
      let finish = false
      let restock = false
      if (command.type === 'cancelRefund') {
        if (!['PENDING', 'WAIT_RETURN'].includes(refund.status))
          throw new DemoDomainError('商品寄出后无法撤销，请联系商家', 409)
        refund.status = 'CANCELLED'
        refund.resolvedAt = now
        order.status = originalStatus
      } else if (command.type === 'returnRefund') {
        if (refund.status !== 'WAIT_RETURN') throw new DemoDomainError('请等待商家同意退货', 409)
        const carrier = text(command.carrier, '退货物流公司', 30)
        const tracking = typeof command.tracking === 'string' ? command.tracking.trim() : ''
        if (!/^[a-zA-Z0-9]{8,24}$/.test(tracking))
          throw new DemoDomainError('请填写 8–24 位字母或数字物流单号')
        Object.assign(refund, {
          status: 'WAIT_RECEIPT',
          returnCarrier: carrier,
          returnTracking: tracking,
          returnedAt: now,
        })
      } else if (command.type === 'confirmRefundReturn') {
        if (refund.status !== 'WAIT_RECEIPT')
          throw new DemoDomainError('用户尚未寄回商品或退款已处理', 409)
        if (typeof command.restock !== 'boolean')
          throw new DemoDomainError('请确认退货是否重新入库')
        finish = true
        restock = command.restock
        refund.reply = '商家确认收到退货，模拟退款完成'
      } else {
        if (refund.status !== 'PENDING') throw new DemoDomainError('仅待审核申请可执行此操作', 409)
        if (typeof command.approve !== 'boolean') throw new DemoDomainError('请选择退款处理结果')
        if (!command.approve) {
          refund.reply = text(command.reply, '拒绝原因（最多 200 字）', 200)
          refund.status = 'REJECTED'
          refund.resolvedAt = now
          order.status = originalStatus
        } else if (refund.type === 'RETURN_REFUND') {
          const address = validateRecipient(command.returnAddress)
          Object.assign(refund, {
            status: 'WAIT_RETURN',
            returnAddress: address,
            acceptedAt: now,
            reply: '商家同意退货，请按地址寄回商品',
          })
        } else {
          finish = true
          restock = originalStatus === '待发货'
          refund.reply = '商家同意整单退款'
        }
      }
      if (finish) {
        for (const item of orderItems(order)) {
          const product = state.products.find((entry) => entry.id === item.productId && owns(entry))
          if (!product) continue
          const sku = product.skus?.find((entry) => entry.id === item.skuId)
          if (restock) {
            if (product.skus) {
              if (sku) sku.stock += item.quantity
              product.stock = product.skus.reduce((sum, entry) => sum + entry.stock, 0)
            } else if (!item.skuId) product.stock += item.quantity
          }
          if (sku) sku.sold = Math.max(0, sku.sold - item.quantity)
          product.sold = Math.max(0, product.sold - item.quantity)
        }
        Object.assign(refund, { status: 'APPROVED', resolvedAt: now, restocked: restock })
        order.status = '已退款'
      }
    }
  } else if (command.type === 'ship' || command.type === 'receive') {
    const order = state.orders.find((order) => order.id === command.id)
    if (!order) throw new DemoDomainError('订单不存在', 404)
    if (command.type === 'ship') {
      if (!owns(order)) throw new DemoDomainError('只能处理本店订单', 403)
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
      if (order.buyerId !== actor.id) throw new DemoDomainError('只能确认自己的订单', 403)
      if (order.status !== '待收货') throw new DemoDomainError('仅待收货订单可以确认收货', 409)
      Object.assign(order, { status: '已完成', completedAt: new Date().toLocaleString('zh-CN') })
    }
  } else if (command.type === 'createProduct' || command.type === 'editProduct') {
    const previous =
      command.type === 'editProduct'
        ? state.products.find((product) => product.id === command.id)
        : undefined
    if (command.type === 'editProduct' && !previous) throw new DemoDomainError('商品不存在', 404)
    if (previous && !owns(previous)) throw new DemoDomainError('只能编辑本店商品', 403)
    if (
      previous &&
      command.expectedVersion !== undefined &&
      command.expectedVersion !== (previous.managementVersion || 0)
    )
      throw new DemoDomainError('商品资料已变化，请重新打开编辑', 409)
    const title = text(command.title, '商品名称（最多 60 字）', 60)
    const optionalText = (value: unknown, fallback: string, label: string, max: number) => {
      if (value === undefined) return fallback
      if (typeof value !== 'string' || value.trim().length > max)
        throw new DemoDomainError(`请填写有效的${label}（最多 ${max} 字）`)
      return value.trim()
    }
    const category = command.category ?? previous?.category ?? '周边'
    if (category !== '周边' && category !== '画作') throw new DemoDomainError('请选择商品分类')
    const images =
      command.images ??
      (command.cover === undefined
        ? previous?.images || (previous ? [previous.cover] : [])
        : [command.cover])
    if (
      !Array.isArray(images) ||
      !images.length ||
      images.length > 6 ||
      new Set(images).size !== images.length ||
      images.some(
        (image) =>
          typeof image !== 'string' ||
          (!Object.values(DEMO_ASSETS).includes(image) &&
            !/^\/api\/demo\/images\/[a-f0-9-]{36}\.jpg$/.test(image)),
      )
    )
      throw new DemoDomainError('请选择 1–6 张有效商品图片')
    const parsePrice = (value: unknown) => {
      if (typeof value !== 'string' || !/^\d{1,6}(\.\d{1,2})?$/.test(value) || Number(value) <= 0)
        throw new DemoDomainError('请填写有效价格和整数库存')
      return Math.round(Number(value) * 100)
    }
    const parseStock = (value: unknown) => {
      if (typeof value !== 'string' || !/^\d{1,6}$/.test(value))
        throw new DemoDomainError('请填写有效价格和整数库存')
      return Number(value)
    }
    let skus: DemoSku[] | undefined
    if (command.skus !== undefined) {
      if (!Array.isArray(command.skus) || !command.skus.length || command.skus.length > 12)
        throw new DemoDomainError('请设置 1–12 个商品规格')
      skus = command.skus.map((raw: unknown) => {
        if (!raw || typeof raw !== 'object') throw new DemoDomainError('商品规格无效')
        const row = raw as Record<string, unknown>
        const id = text(row.id, '规格标识', 64)
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new DemoDomainError('商品规格标识无效')
        const old = previous?.skus?.find((sku) => sku.id === id)
        const stock = row.stock === undefined && old ? old.stock : parseStock(row.stock)
        if (
          old &&
          row.stock !== undefined &&
          stock !== old.stock &&
          row.expectedStock !== old.stock
        )
          throw new DemoDomainError('库存已变化，请重新打开商品编辑后确认库存', 409)
        return {
          id,
          name: text(row.name, '规格名称（最多 30 字）', 30),
          price: parsePrice(row.price),
          stock,
          sold: old?.sold || 0,
        }
      })
      if (
        new Set(skus.map((sku) => sku.id)).size !== skus.length ||
        new Set(skus.map((sku) => sku.name.toLowerCase())).size !== skus.length
      )
        throw new DemoDomainError('规格名称或标识不能重复')
    } else if (previous?.skus) throw new DemoDomainError('请按规格修改商品价格和库存')
    const updatesStock = command.type === 'createProduct' || command.stock !== undefined
    const price = skus ? Math.min(...skus.map((sku) => sku.price)) : parsePrice(command.price)
    const stock = skus
      ? skus.reduce((sum, sku) => sum + sku.stock, 0)
      : updatesStock
        ? parseStock(command.stock)
        : previous!.stock
    if (!skus && previous && updatesStock && command.expectedStock !== undefined) {
      if (!Number.isSafeInteger(command.expectedStock) || Number(command.expectedStock) < 0)
        throw new DemoDomainError('请重新打开商品编辑后修改库存')
      if (previous.stock !== command.expectedStock)
        throw new DemoDomainError('库存已变化，请重新打开商品编辑后确认库存', 409)
    }
    if (command.published !== undefined && typeof command.published !== 'boolean')
      throw new DemoDomainError('商品上架状态无效')
    const tags = normalizeProductTags(
      command.tags !== undefined
        ? command.tags
        : command.tag !== undefined
          ? command.tag === ''
            ? []
            : [command.tag]
          : previous
            ? productTags(previous)
            : [],
    )
    const video = command.video === undefined ? previous?.video || '' : command.video
    if (
      typeof video !== 'string' ||
      (video !== '' && !/^\/api\/demo\/videos\/[a-f0-9-]{36}\.mp4$/.test(video))
    )
      throw new DemoDomainError('请使用已上传的商品视频')
    const fields = {
      video,
      title,
      price,
      stock,
      category: category as DemoProduct['category'],
      subtitle: optionalText(
        command.subtitle,
        previous?.subtitle || '来自星屿小店的新心意',
        '商品简介',
        100,
      ),
      description: optionalText(command.description, previous?.description || '', '商品详情', 2000),
      tags,
      tag: tags[0] || '',
      cover: images[0] as string,
      images: images as string[],
      ...(skus ? { skus } : {}),
      ...(command.published === undefined ? {} : { published: command.published }),
    }
    if (previous) {
      Object.assign(previous, fields)
      previous.managementVersion = (previous.managementVersion || 0) + 1
    } else
      state.products.unshift({
        id: `product-${makeId()}`,
        shopId,
        ...fields,
        sold: 0,
        published: command.published !== false,
      })
  } else if (command.type === 'toggleProduct') {
    const product = state.products.find((product) => product.id === command.id)
    if (!product) throw new DemoDomainError('商品不存在', 404)
    if (!owns(product)) throw new DemoDomainError('只能编辑本店商品', 403)
    if (product.adminHidden) throw new DemoDomainError('商品已由平台下架，请查看处理原因', 403)
    product.published = !product.published
    product.managementVersion = (product.managementVersion || 0) + 1
  } else if (command.type === 'editShop') {
    const fields = {
      name: text(command.name, '店铺名称（最多 20 字）', 20),
      description: text(command.description, '店铺介绍（最多 50 字）', 50),
    }
    state.shops = marketplaceShops(state).map((shop) =>
      shop.id === shopId
        ? { ...shop, ...fields, managementVersion: (shop.managementVersion || 0) + 1 }
        : shop,
    )
    if (shopId === DEMO_SHOP_ID) state.shop = fields
  } else if (command.type === 'submitShopReview') {
    const shop = marketplaceShops(state).find((shop) => shop.id === shopId)
    if (!shop || shop.status !== 'REJECTED')
      throw new DemoDomainError('仅审核未通过的店铺可以重新提交', 409)
    shop.status = 'PENDING'
    shop.reason = ''
    shop.managementVersion = (shop.managementVersion || 0) + 1
    state.shops = marketplaceShops(state)
  } else if (command.type === 'reset') {
    if (state.products.some((product) => owns(product) && product.adminHidden))
      throw new DemoDomainError('本店有平台下架商品，恢复展示后才能重置演示数据', 403)
    const versions = new Map(
      state.products.filter(owns).map((product) => [product.id, product.managementVersion || 0]),
    )
    state.datasetId = makeId()
    state.products = state.products.filter((product) => !owns(product))
    state.orders = state.orders.filter((order) => !owns(order))
    if (state.reviews) state.reviews = state.reviews.filter((review) => !owns(review))
    if (shopId === DEMO_SHOP_ID) {
      state.products.unshift(
        ...DEMO_PRODUCTS.map((product) => ({
          ...product,
          managementVersion: (versions.get(product.id) || 0) + 1,
        })),
      )
      state.shop = { name: '星屿周边馆', description: '认真收藏，每一份热爱' }
      state.shops = marketplaceShops(state).map((shop) =>
        shop.id === shopId
          ? { ...shop, ...state.shop, managementVersion: (shop.managementVersion || 0) + 1 }
          : shop,
      )
    }
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
