import { test as base, expect, type APIRequestContext } from '@playwright/test'
import type { DemoSession } from '../../packages/shared/src/auth'

// Existing transaction regressions run as the seeded demo account. Auth-specific
// tests use Playwright's raw fixtures to exercise the public entry and guards.
export const test = base.extend<{ demoSessions: Record<'user' | 'merchant', DemoSession> }>({
  demoSessions: async ({ playwright }, use) => {
    const request = await playwright.request.newContext()
    const sessions = {} as Record<'user' | 'merchant', DemoSession>
    for (const role of ['user', 'merchant'] as const) {
      const response = await request.post('http://127.0.0.1:8787/api/demo/auth/login', {
        data: { role, phone: '13800000000', password: '123456' },
      })
      expect(response.ok()).toBe(true)
      sessions[role] = (await response.json()).session
    }
    await use(sessions)
    await request.dispose()
  },
  context: async ({ context, demoSessions }, use) => {
    await context.addInitScript((sessions) => {
      if (location.port !== '4173' && location.port !== '4174') return
      const session = location.port === '4174' ? sessions.merchant : sessions.user
      localStorage.setItem(
        'starisle.auth.session',
        JSON.stringify({ type: 'object', data: session }),
      )
    }, demoSessions)
    await use(context)
  },
  request: async ({ playwright, demoSessions }, use) => {
    const request = await playwright.request.newContext()
    const authenticated = new Proxy(request, {
      get(target, property) {
        const method = Reflect.get(target, property)
        if (['get', 'post', 'put', 'delete', 'patch', 'fetch', 'head'].includes(String(property)))
          return (url: string, options: Record<string, any> = {}) => {
            const role = options.headers?.['X-Demo-Role'] === 'merchant' ? 'merchant' : 'user'
            return method.call(target, url, {
              ...options,
              headers: { Authorization: `Bearer ${demoSessions[role].token}`, ...options.headers },
            })
          }
        return typeof method === 'function' ? method.bind(target) : method
      },
    }) as APIRequestContext
    await use(authenticated)
    await request.dispose()
  },
})
export { expect }
