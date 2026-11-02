export type AuthRole = 'user' | 'merchant' | 'admin'
import { DEMO_MERCHANT_VERIFICATION_CODE } from './demo-domain'
export { DEMO_MERCHANT_VERIFICATION_CODE } from './demo-domain'
export interface DemoSession {
  token: string
  expiresAt: number
  role: AuthRole
  account: {
    id: string
    phone?: string
    username?: string
    nickname: string
    roles: AuthRole[]
    shopId?: string
  }
}
const sessionKey = 'starisle.auth.session'
const guestKey = 'starisle.auth.guest'
export const demoApiBase = (
  import.meta.env.VITE_DEMO_API_BASE_URL || 'http://127.0.0.1:8787'
).replace(/\/$/, '')
export function getDemoSession(): DemoSession | undefined {
  const session = uni.getStorageSync(sessionKey) as DemoSession | undefined
  return session?.token && session.expiresAt > Date.now() ? session : undefined
}
export function clearDemoSession() {
  uni.removeStorageSync(sessionKey)
  uni.removeStorageSync(guestKey)
}
export function isGuest(): boolean {
  return !getDemoSession() && uni.getStorageSync(guestKey) === true
}
function safeDestination(url: string, role: AuthRole): string {
  if (role === 'admin') return '/pages/admin/index'
  if (role === 'merchant') return '/pages/merchant/index'
  return /^\/pages\/(index\/index|product\/detail|order\/detail|shop\/detail|checkout\/index|address\/index)(\?|$)/.test(
    url,
  )
    ? url
    : '/pages/index/index'
}
export function openLogin(role: AuthRole = 'user', destination = '') {
  uni.reLaunch({
    url: `/pages/auth/index?role=${role}&next=${encodeURIComponent(safeDestination(destination, role))}`,
  })
}
export function requireDemoLogin(role: AuthRole = 'user', destination = ''): boolean {
  if (getDemoSession()?.role === role) return true
  openLogin(role, destination)
  return false
}
export function canBrowse(destination: string): boolean {
  const session = getDemoSession()
  if (session && session.role !== 'user') {
    uni.reLaunch({ url: safeDestination('', session.role) })
    return false
  }
  if (getDemoSession() || isGuest()) return true
  openLogin('user', destination)
  return false
}
function authRequest(
  action: string,
  data: Record<string, unknown>,
  method: 'GET' | 'POST' = 'POST',
): Promise<DemoSession | undefined> {
  const session = getDemoSession()
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${demoApiBase}/api/demo/auth/${action}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      timeout: 5000,
      success(response) {
        const body = response.data as { session?: DemoSession; message?: string }
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(body.session)
        else {
          if (
            response.statusCode === 401 &&
            action === 'session' &&
            getDemoSession()?.token === session?.token
          ) {
            clearDemoSession()
            openLogin(session?.role)
          }
          reject(new Error(body.message || '暂时无法登录，请稍后重试'))
        }
      },
      fail() {
        reject(new Error('暂时无法连接演示服务，请检查服务后重试'))
      },
    })
  })
}
export function validateDemoCredentials(phone: string, password: string, role: AuthRole = 'user') {
  if (role === 'admin') {
    if (!phone.trim()) throw new Error('请填写管理员账号')
    if (!password || password.length > 128) throw new Error('请填写有效的管理员密码')
    return
  }
  if (!/^1\d{10}$/.test(phone.trim())) throw new Error('请填写 11 位手机号')
  if (password.length < 6 || password.length > 128) throw new Error('密码需为 6–128 位')
}
export async function submitDemoAuth(
  action: 'register' | 'login',
  role: AuthRole,
  phone: string,
  password: string,
  shopName = '',
  qualificationCode = '',
) {
  if (role === 'admin' && action === 'register') throw new Error('管理员不开放注册')
  validateDemoCredentials(phone, password, role)
  if (action === 'register' && role === 'merchant') {
    if (!qualificationCode) throw new Error('请填写商家资质验证码')
    if (qualificationCode !== DEMO_MERCHANT_VERIFICATION_CODE)
      throw new Error('资质验证码不正确，请输入页面显示的演示验证码')
  }
  const session = await authRequest(action, {
    role,
    ...(role === 'admin' ? { username: phone.trim() } : { phone: phone.trim() }),
    password,
    shopName,
    ...(action === 'register' && role === 'merchant' ? { qualificationCode } : {}),
  })
  if (!session) throw new Error('登录信息无效，请重试')
  uni.setStorageSync(sessionKey, session)
  uni.removeStorageSync(guestKey)
  return session
}
export async function refreshDemoSession(): Promise<DemoSession> {
  const previous = getDemoSession()
  if (!previous) throw new Error('请先登录')
  const session = await authRequest('session', {}, 'GET')
  if (!session || getDemoSession()?.token !== previous.token)
    throw new Error('登录信息已变化，请重新登录')
  uni.setStorageSync(sessionKey, session)
  return session
}
export function enterAfterLogin(session: DemoSession, destination = '') {
  uni.reLaunch({ url: safeDestination(destination, session.role) })
}
export function browseAsGuest() {
  uni.removeStorageSync(sessionKey)
  uni.setStorageSync(guestKey, true)
  uni.reLaunch({ url: '/pages/index/index' })
}
export async function logoutDemo(role: AuthRole = 'user') {
  await authRequest('logout', {})
  uni.removeStorageSync(sessionKey)
  uni.removeStorageSync(guestKey)
  openLogin(role)
}
