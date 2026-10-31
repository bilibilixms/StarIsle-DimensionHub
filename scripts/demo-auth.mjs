import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  DemoDomainError,
  DEMO_SHOP_ID,
  DEMO_MERCHANT_VERIFICATION_CODE,
} from '../packages/shared/src/demo-domain.ts'

export function passwordDigest(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 32).toString('hex') }
}
function matches(password, account) {
  const actual = scryptSync(password, account.salt, 32)
  const expected = Buffer.from(account.hash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export function createDemoAuth() {
  return {
    accounts: [
      {
        id: 'demo-user',
        phone: '13800000000',
        nickname: '小星同学',
        roles: ['user', 'merchant'],
        shopId: DEMO_SHOP_ID,
        ...passwordDigest('123456'),
      },
    ],
    sessions: {},
  }
}
function publicAccount(account) {
  return {
    id: account.id,
    phone: account.phone,
    nickname: account.nickname,
    roles: [...account.roles],
    shopId: account.shopId,
  }
}
export function authenticate(store, authorization) {
  const token = typeof authorization === 'string' ? authorization.replace(/^Bearer /, '') : ''
  const session = store.auth.sessions[token]
  if (!session || session.expiresAt <= Date.now()) return undefined
  const account = store.auth.accounts.find((account) => account.id === session.accountId)
  return account
    ? {
        token,
        role: session.role,
        account,
        actor: { id: account.id, nickname: account.nickname, shopId: account.shopId },
      }
    : undefined
}
export function applyAuth(store, action, data) {
  if (!['user', 'merchant'].includes(data?.role)) throw new DemoDomainError('该身份暂未开放', 403)
  const phone = typeof data.phone === 'string' ? data.phone.trim() : ''
  if (!/^1\d{10}$/.test(phone)) throw new DemoDomainError('请填写 11 位手机号')
  if (typeof data.password !== 'string' || data.password.length < 6 || data.password.length > 128)
    throw new DemoDomainError('密码需为 6–128 位')
  let account = store.auth.accounts.find((account) => account.phone === phone)
  if (action === 'register') {
    if (data.role === 'merchant') {
      if (!data.qualificationCode) throw new DemoDomainError('请填写商家资质验证码')
      if (data.qualificationCode !== DEMO_MERCHANT_VERIFICATION_CODE)
        throw new DemoDomainError('资质验证码不正确，请输入页面显示的演示验证码')
    }
    if (account) {
      if (!matches(data.password, account))
        throw new DemoDomainError('该手机号已注册，请使用原密码登录或开通新身份', 409)
      if (account.roles.includes(data.role))
        throw new DemoDomainError('该手机号已注册此身份，请直接登录', 409)
      account.roles.push(data.role)
    } else {
      account = {
        id: randomUUID(),
        phone,
        nickname: `星屿同学${phone.slice(-4)}`,
        roles: [data.role],
        ...passwordDigest(data.password),
      }
      store.auth.accounts.push(account)
    }
    if (data.role === 'merchant') {
      const name =
        typeof data.shopName === 'string' && data.shopName.trim()
          ? data.shopName.trim()
          : `星屿小店${phone.slice(-4)}`
      if (name.length > 30) throw new DemoDomainError('店铺名称最多 30 字')
      account.shopId = `shop-${account.id}`
      store.marketplace.shops ||= [{ id: DEMO_SHOP_ID, ...store.marketplace.shop }]
      store.marketplace.shops.push({
        id: account.shopId,
        name,
        description: '认真收藏，每一份热爱',
      })
      store.marketplace.revision += 1
    }
  } else {
    if (!account || !matches(data.password, account))
      throw new DemoDomainError('手机号或密码不正确', 401)
    if (!account.roles.includes(data.role))
      throw new DemoDomainError('尚未注册此身份，请先注册', 403)
  }
  for (const [key, session] of Object.entries(store.auth.sessions))
    if (session.expiresAt <= Date.now()) delete store.auth.sessions[key]
  const token = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000
  store.auth.sessions[token] = { accountId: account.id, role: data.role, expiresAt }
  return { token, expiresAt, role: data.role, account: publicAccount(account) }
}
