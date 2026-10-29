export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface Product {
  id: string
  title: string
  price: string
  coverUrl: string | null
  shopName: string
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export function createApiClient(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, '')
  function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      uni.request({
        url: `${base}${path}`,
        method: 'GET',
        data: params,
        timeout: 10000,
        success(response) {
          const body = response.data as Partial<ApiResponse<T>> | null
          if (response.statusCode >= 200 && response.statusCode < 300 && body?.code === 0) {
            resolve(body.data as T)
          } else {
            reject(new ApiError(body?.message || '请求失败，请稍后重试', response.statusCode, body?.code ?? response.statusCode))
          }
        },
        fail() { reject(new ApiError('暂时无法连接，请稍后重试', 0, 0)) },
      })
    })
  }
  return {
    products: (q = '', page = 1, size = 20) => get<PageResult<Product>>('/api/v1/products', { q, page, size }),
  }
}
