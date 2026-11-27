import { ApiError } from './index'

export const springMarketplaceEnabled = import.meta.env.VITE_MARKETPLACE_BACKEND === 'spring'
export const springApiBase = (import.meta.env.VITE_SPRING_API_BASE_URL || 'http://127.0.0.1:8080').replace(
  /\/$/,
  '',
)

export function springMediaUrl(path: string): string {
  return path.startsWith('/api/v1/images/') ? `${springApiBase}${path}` : path
}

export function springRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT',
  token?: string,
  data?: Record<string, unknown>,
  operationId?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${springApiBase}/api/v1${path}`,
      method,
      data,
      timeout: 6000,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(operationId ? { 'X-Idempotency-Key': operationId } : {}),
      },
      success(response) {
        const body = response.data as { code?: number; data?: T; message?: string } | null
        if (response.statusCode >= 200 && response.statusCode < 300 && body?.code === 0) {
          resolve(body.data as T)
        } else {
          reject(new ApiError(body?.message || '请求失败，请稍后重试', response.statusCode, body?.code ?? response.statusCode))
        }
      },
      fail() {
        reject(new ApiError('暂时无法连接 Spring Boot 服务，请检查后重试', 0, 0))
      },
    })
  })
}
