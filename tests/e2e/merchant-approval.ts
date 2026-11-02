import { expect, type APIRequestContext } from '@playwright/test'

// Existing checkout/storefront regressions start with an approved merchant.
// The administrator suite covers the actual pending, rejection and resubmission UI.
export async function approveMerchant(request: APIRequestContext, shopId: string) {
  const login = await request.post('http://127.0.0.1:8787/api/demo/auth/login', {
    data: { role: 'admin', username: 'admin', password: '123' },
  })
  expect(login.ok()).toBe(true)
  const session = (await login.json()).session
  const headers = { Authorization: `Bearer ${session.token}` }
  try {
    const response = await request.get('http://127.0.0.1:8787/api/demo/admin/state', { headers })
    expect(response.ok()).toBe(true)
    const shop = (await response.json()).state.shops.find(
      (shop: { id: string }) => shop.id === shopId,
    )
    expect(shop).toBeTruthy()
    const result = await request.post('http://127.0.0.1:8787/api/demo/admin/commands', {
      headers: { ...headers, 'X-Idempotency-Key': `approval-${shopId}` },
      data: {
        type: 'reviewShop',
        id: shopId,
        version: shop.managementVersion,
        decision: 'approve',
      },
    })
    expect(result.ok()).toBe(true)
  } finally {
    await request.post('http://127.0.0.1:8787/api/demo/auth/logout', { headers, data: {} })
  }
}
