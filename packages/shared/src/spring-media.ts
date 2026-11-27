import { clearDemoSession, getDemoSession, openLogin } from './auth'
import { springApiBase, springMediaUrl } from './spring-api'

const uploads = {
  productImage: {
    endpoint: '/merchant/product-images',
    role: 'merchant',
    name: '图片',
    timeout: 15_000,
  },
  reviewImage: { endpoint: '/orders/review-images', role: 'user', name: '图片', timeout: 15_000 },
  productVideo: {
    endpoint: '/merchant/product-videos',
    role: 'merchant',
    name: '视频',
    timeout: 120_000,
  },
} as const

export function uploadSpringMedia(
  path: string,
  token: string,
  type: keyof typeof uploads,
): Promise<string> {
  const { endpoint, role, name, timeout } = uploads[type]
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${springApiBase}/api/v1${endpoint}`,
      filePath: path,
      name: 'file',
      header: { Authorization: `Bearer ${token}` },
      timeout,
      success(response) {
        if (response.statusCode === 401 && getDemoSession()?.token === token) {
          clearDemoSession()
          openLogin(role)
        }
        let body: { code?: number; data?: { url?: string }; message?: string }
        try {
          body = JSON.parse(response.data) || {}
        } catch {
          reject(new Error(`${name}上传失败，请检查服务后重试`))
          return
        }
        if (response.statusCode === 201 && body.code === 0 && body.data?.url) {
          resolve(springMediaUrl(body.data.url))
        } else {
          reject(new Error(body.message || `${name}上传失败，请重试`))
        }
      },
      fail: () => reject(new Error(`${name}上传失败，请检查 Spring Boot 服务后重试`)),
    })
  })
}
