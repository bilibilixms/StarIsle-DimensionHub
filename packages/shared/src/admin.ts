import { demoApiBase, getDemoSession, clearDemoSession, openLogin } from './auth'
import type { AuthRole } from './auth'
import type { DemoProduct, DemoShop, DemoOrder } from './demo-domain'

export interface AdminAccount {
  id: string
  phone?: string
  username?: string
  nickname: string
  roles: AuthRole[]
  shopId?: string
  disabled: boolean
  reason: string
  managementVersion: number
}
export interface AdminShop extends DemoShop {
  ownerPhone: string
  managementVersion: number
}
export interface AdminProduct extends DemoProduct {
  shopId: string
  shopName: string
  visible: boolean
  managementVersion: number
}
export interface AdminLog {
  id: string
  actorId: string
  actor: string
  targetId: string
  targetName: string
  action: string
  reason: string
  before: string
  after: string
  createdAt: string
}
export interface AdminState {
  revision: number
  accounts: AdminAccount[]
  shops: AdminShop[]
  products: AdminProduct[]
  orders: DemoOrder[]
  logs: AdminLog[]
  summary: {
    accounts: number
    pendingShops: number
    activeShops: number
    publishedProducts: number
    orders: number
    revenue: number
  }
}
export interface AdminCommand {
  type: 'setAccountDisabled' | 'reviewShop' | 'setShopSuspended' | 'setProductHidden'
  id: string
  version: number
  reason?: string
  disabled?: boolean
  decision?: 'approve' | 'reject'
  suspended?: boolean
  hidden?: boolean
}
function request(command?: AdminCommand): Promise<AdminState> {
  const session = getDemoSession()
  if (!session || session.role !== 'admin') {
    openLogin('admin')
    return Promise.reject(new Error('请先登录管理员账号'))
  }
  const storageKey = `starisle.admin.pending.${session.account.id}`
  const pending = (uni.getStorageSync(storageKey) || {}) as Record<string, string>
  const fingerprint = command ? JSON.stringify(command) : ''
  const operationId = fingerprint
    ? pending[fingerprint] || `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`
    : ''
  if (command) {
    pending[fingerprint] = operationId
    uni.setStorageSync(storageKey, pending)
  }
  function clearPending() {
    const latest = (uni.getStorageSync(storageKey) || {}) as Record<string, string>
    delete latest[fingerprint]
    uni.setStorageSync(storageKey, latest)
  }
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${demoApiBase}/api/demo/admin/${command ? 'commands' : 'state'}`,
      method: command ? 'POST' : 'GET',
      data: command,
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
        ...(operationId ? { 'X-Idempotency-Key': operationId } : {}),
      },
      timeout: 5000,
      success(response) {
        const body = response.data as { state?: AdminState; message?: string }
        if (getDemoSession()?.token !== session.token)
          return reject(new Error('登录信息已变化，请重新登录'))
        if (response.statusCode >= 200 && response.statusCode < 300 && body?.state) {
          if (command) clearPending()
          resolve(body.state)
        } else {
          if (command && response.statusCode < 500) clearPending()
          if (response.statusCode === 401) {
            clearDemoSession()
            openLogin('admin')
          }
          reject(new Error(body?.message || '管理操作失败，请稍后重试'))
        }
      },
      fail() {
        reject(new Error('暂时无法连接演示服务，请检查服务后重试'))
      },
    })
  })
}
export function loadAdminState() {
  return request()
}
export function submitAdminCommand(command: AdminCommand) {
  return request(command)
}
