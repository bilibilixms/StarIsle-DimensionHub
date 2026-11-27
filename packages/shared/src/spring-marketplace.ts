import {
  DEMO_ASSETS,
  type DemoMarketplace,
  type DemoOrder,
  type DemoOrderStatus,
  type DemoProduct,
  type DemoRecipient,
  type DemoShop,
} from './demo-domain'
import { springApiBase, springImageUrl, springRequest } from './spring-api'

interface CatalogSku {
  id: string
  name: string
  price: string
  stock: number
  sold: number
}

interface CatalogProduct {
  id: string
  shopId: string
  title: string
  subtitle: string
  description: string
  category: DemoProduct['category']
  tags: string[]
  images: string[]
  coverUrl: string | null
  price: string
  stock: number
  sold: number
  status: string
  managementVersion: number
  skus: CatalogSku[]
}

interface ShopProfile {
  id: string
  name: string
  description: string
  status: 'PENDING' | 'ACTIVE' | 'DISABLED'
}

interface OrderItem {
  productId: string
  skuId: string
  title: string
  variant: string
  coverUrl: string | null
  unitPrice: number
  quantity: number
}

interface Order {
  id: string
  shopId: string
  shopName: string
  buyerId: string
  buyer: string
  recipient: DemoRecipient
  amount: number
  status: 'PAID' | 'SHIPPED' | 'COMPLETED'
  carrier: string | null
  tracking: string | null
  createdAt: string
  shippedAt: string | null
  completedAt: string | null
  items: OrderItem[]
}

interface Snapshot {
  products: CatalogProduct[]
  shops: ShopProfile[]
  orders: Order[]
}

const statuses: Record<Order['status'], DemoOrderStatus> = {
  PAID: '待发货',
  SHIPPED: '待收货',
  COMPLETED: '已完成',
}

function cents(price: string): number {
  const [whole, fraction = ''] = price.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

function product({ skus, coverUrl, status, ...entry }: CatalogProduct): DemoProduct {
  return {
    ...entry,
    cover: coverUrl ? springImageUrl(coverUrl) : DEMO_ASSETS.figurine,
    images: entry.images.map(springImageUrl),
    price: cents(entry.price),
    published: status === 'PUBLISHED',
    tag: entry.tags[0] || '',
    skus: skus.map((sku) => ({ ...sku, price: cents(sku.price) })),
  }
}

function order(entry: Order): DemoOrder {
  const items = entry.items.map(({ coverUrl, ...item }) => ({
    ...item,
    cover: coverUrl ? springImageUrl(coverUrl) : DEMO_ASSETS.figurine,
    amount: item.unitPrice * item.quantity,
  }))
  const first = items[0]!
  return {
    ...entry,
    productId: first.productId,
    title: first.title,
    cover: first.cover,
    variant: first.variant,
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    status: statuses[entry.status],
    carrier: entry.carrier || undefined,
    tracking: entry.tracking || undefined,
    createdAt: new Date(entry.createdAt).toLocaleString('zh-CN'),
    shippedAt: entry.shippedAt ? new Date(entry.shippedAt).toLocaleString('zh-CN') : undefined,
    completedAt: entry.completedAt ? new Date(entry.completedAt).toLocaleString('zh-CN') : undefined,
    items,
  }
}

let snapshotRevision = 0
export async function loadSpringMarketplace(token?: string): Promise<DemoMarketplace> {
  const revision = (snapshotRevision = Math.max(snapshotRevision + 1, Date.now()))
  const snapshot = await springRequest<Snapshot>('/marketplace', 'GET', token)
  const shops = snapshot.shops.map(
    ({ status, ...shop }): DemoShop => ({ ...shop, status: status === 'DISABLED' ? 'SUSPENDED' : status }),
  )
  return {
    version: 1,
    datasetId: springApiBase,
    revision,
    shops,
    shop: shops[0] || { name: '星屿', description: '' },
    products: snapshot.products.map(product),
    orders: snapshot.orders.map(order),
  }
}
