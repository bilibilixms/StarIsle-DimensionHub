import {
  DemoDomainError,
  marketplaceShops,
  productShopId,
  productVisible,
} from '../packages/shared/src/demo-domain.ts'

export function adminSnapshot(store) {
  const accounts = store.auth.accounts.map((account) => ({
    id: account.id,
    phone: account.phone,
    username: account.username,
    nickname: account.nickname,
    roles: [...account.roles],
    shopId: account.shopId,
    disabled: !!account.disabled,
    reason: account.disabledReason || '',
    managementVersion: account.managementVersion || 0,
  }))
  const shops = marketplaceShops(store.marketplace).map((shop) => ({
    ...shop,
    status: shop.status || 'ACTIVE',
    managementVersion: shop.managementVersion || 0,
    ownerPhone: accounts.find((account) => account.shopId === shop.id)?.phone || '',
  }))
  const products = store.marketplace.products.map((product) => ({
    ...product,
    shopId: productShopId(product),
    shopName: shops.find((shop) => shop.id === productShopId(product))?.name || '',
    managementVersion: product.managementVersion || 0,
    visible: productVisible(store.marketplace, product),
  }))
  return structuredClone({
    accounts,
    shops,
    products,
    orders: store.marketplace.orders,
    logs: store.management?.logs || [],
    revision: store.management?.revision || 0,
    summary: {
      accounts: accounts.filter((account) => !account.roles.includes('admin')).length,
      pendingShops: shops.filter((shop) => shop.status === 'PENDING').length,
      activeShops: shops.filter((shop) => shop.status === 'ACTIVE' && !shop.ownerDisabled).length,
      publishedProducts: products.filter((product) => product.visible).length,
      orders: store.marketplace.orders.length,
      revenue: store.marketplace.orders.reduce((sum, order) => sum + order.amount, 0),
    },
  })
}

export function applyAdminCommand(store, command, identity, makeId) {
  if (identity.role !== 'admin') throw new DemoDomainError('仅管理员可以执行此操作', 403)
  if (typeof command.id !== 'string' || !command.id) throw new DemoDomainError('请选择处理对象')
  let target, before, after, action, targetName
  const shops = marketplaceShops(store.marketplace)
  const reason = typeof command.reason === 'string' ? command.reason.trim() : ''
  if (reason.length > 200) throw new DemoDomainError('处理原因最多 200 字')
  const requireReason = () => {
    if (!reason) throw new DemoDomainError('请填写处理原因')
  }
  const checkVersion = (item) => {
    if (!item) throw new DemoDomainError('处理对象不存在，请刷新列表', 404)
    if (!Number.isSafeInteger(command.version) || command.version !== (item.managementVersion || 0))
      throw new DemoDomainError('信息已变化，请刷新后重新处理', 409)
  }
  if (command.type === 'setAccountDisabled') {
    target = store.auth.accounts.find((account) => account.id === command.id)
    checkVersion(target)
    if (target.roles.includes('admin')) throw new DemoDomainError('管理员账号不能禁用', 403)
    if (typeof command.disabled !== 'boolean') throw new DemoDomainError('请选择账号状态')
    if (!!target.disabled === command.disabled)
      throw new DemoDomainError('账号状态已变化，请刷新', 409)
    if (command.disabled) requireReason()
    before = target.disabled ? '已禁用' : '正常'
    target.disabled = command.disabled
    target.disabledReason = command.disabled ? reason : ''
    if (command.disabled) {
      for (const [token, session] of Object.entries(store.auth.sessions))
        if (session.accountId === target.id) delete store.auth.sessions[token]
    }
    if (target.shopId) {
      const shop = shops.find((shop) => shop.id === target.shopId)
      if (shop) {
        shop.ownerDisabled = command.disabled
        shop.managementVersion = (shop.managementVersion || 0) + 1
        store.marketplace.shops = shops
      }
    }
    after = command.disabled ? '已禁用' : '正常'
    action = command.disabled ? '禁用账号' : '恢复账号'
    targetName = target.phone || target.nickname
  } else if (command.type === 'reviewShop' || command.type === 'setShopSuspended') {
    target = shops.find((shop) => shop.id === command.id)
    checkVersion(target)
    before = target.status || 'ACTIVE'
    if (command.type === 'reviewShop') {
      if (before !== 'PENDING') throw new DemoDomainError('该店铺已处理，请刷新', 409)
      if (!['approve', 'reject'].includes(command.decision))
        throw new DemoDomainError('请选择审核结果')
      if (command.decision === 'reject') requireReason()
      after = command.decision === 'approve' ? 'ACTIVE' : 'REJECTED'
      action = command.decision === 'approve' ? '通过商家审核' : '驳回商家审核'
    } else {
      if (typeof command.suspended !== 'boolean') throw new DemoDomainError('请选择店铺状态')
      if (command.suspended ? before !== 'ACTIVE' : before !== 'SUSPENDED')
        throw new DemoDomainError('店铺状态已变化，请刷新', 409)
      if (command.suspended) requireReason()
      after = command.suspended ? 'SUSPENDED' : 'ACTIVE'
      action = command.suspended ? '暂停店铺' : '恢复店铺'
    }
    target.status = after
    target.reason = reason
    targetName = target.name
    store.marketplace.shops = shops
  } else if (command.type === 'setProductHidden') {
    target = store.marketplace.products.find((product) => product.id === command.id)
    checkVersion(target)
    if (typeof command.hidden !== 'boolean') throw new DemoDomainError('请选择商品状态')
    if (!!target.adminHidden === command.hidden)
      throw new DemoDomainError('商品状态已变化，请刷新', 409)
    if (command.hidden) requireReason()
    before = target.adminHidden ? '管理员下架' : '正常'
    target.adminHidden = command.hidden
    target.adminReason = command.hidden ? reason : ''
    after = command.hidden ? '管理员下架' : '正常'
    action = command.hidden ? '下架商品' : '恢复商品展示'
    targetName = target.title
  } else throw new DemoDomainError('不支持的管理操作')
  target.managementVersion = (target.managementVersion || 0) + 1
  store.management ||= { revision: 0, logs: [] }
  store.management.revision += 1
  store.management.logs.unshift({
    id: makeId(),
    actorId: identity.account.id,
    actor: identity.account.username,
    targetId: command.id,
    targetName,
    action,
    reason: reason || action,
    before,
    after,
    createdAt: new Date().toISOString(),
  })
  store.marketplace.revision += 1
}
