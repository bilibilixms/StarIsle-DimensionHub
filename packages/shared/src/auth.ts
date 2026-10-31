export type AuthRole = 'user' | 'merchant'
import { DEMO_MERCHANT_VERIFICATION_CODE } from './demo-domain'
export { DEMO_MERCHANT_VERIFICATION_CODE } from './demo-domain'
export interface DemoSession {
  token: string
  expiresAt: number
  role: AuthRole
  account: { id: string; phone: string; nickname: string; roles: AuthRole[]; shopId?: string }
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
  if (role === 'merchant') return '/pages/merchant/index'
  return /^\/pages\/(index\/index|product\/detail|order\/detail|shop\/detail)(\?|$)/.test(url)
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
  if (getDemoSession()?.role === 'merchant') {
    uni.reLaunch({ url: '/pages/merchant/index' })
    return false
  }
  if (getDemoSession() || isGuest()) return true
  openLogin('user', destination)
  return false
}
function authRequest(
  action: string,
  data: Record<string, unknown>,
): Promise<DemoSession | undefined> {
  const session = getDemoSession()
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${demoApiBase}/api/demo/auth/${action}`,
      method: 'POST',
      data,
      header: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      timeout: 5000,
      success(response) {
        const body = response.data as { session?: DemoSession; message?: string }
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(body.session)
        else reject(new Error(body.message || '暂时无法登录，请稍后重试'))
      },
      fail() {
        reject(new Error('暂时无法连接演示服务，请检查服务后重试'))
      },
    })
  })
}
export function validateDemoCredentials(phone: string, password: string) {
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
  validateDemoCredentials(phone, password)
  if (action === 'register' && role === 'merchant') {
    if (!qualificationCode) throw new Error('请填写商家资质验证码')
    if (qualificationCode !== DEMO_MERCHANT_VERIFICATION_CODE)
      throw new Error('资质验证码不正确，请输入页面显示的演示验证码')
  }
  const session = await authRequest(action, {
    role,
    phone: phone.trim(),
    password,
    shopName,
    ...(action === 'register' && role === 'merchant' ? { qualificationCode } : {}),
  })
  if (!session) throw new Error('登录信息无效，请重试')
  uni.setStorageSync(sessionKey, session)
  uni.removeStorageSync(guestKey)
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
export async function logoutDemo() {
  await authRequest('logout', {})
  uni.removeStorageSync(sessionKey)
  uni.removeStorageSync(guestKey)
  openLogin()
}
