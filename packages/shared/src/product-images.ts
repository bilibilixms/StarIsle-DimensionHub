import { demoApiBase, getDemoSession, clearDemoSession, openLogin } from './auth'
import { springApiBase, springImageUrl, springMarketplaceEnabled } from './spring-api'

function uploadSpringImage(path: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${springApiBase}/api/v1/merchant/product-images`,
      filePath: path,
      name: 'file',
      header: { Authorization: `Bearer ${token}` },
      timeout: 15000,
      success(response) {
        let body: { code?: number; data?: { url?: string }; message?: string } = {}
        try {
          body = JSON.parse(response.data) || {}
        } catch {
          reject(new Error('图片上传失败，请检查服务后重试'))
          return
        }
        if (response.statusCode === 201 && body.code === 0 && body.data?.url) {
          resolve(springImageUrl(body.data.url))
          return
        }
        if (response.statusCode === 401 && getDemoSession()?.token === token) {
          clearDemoSession()
          openLogin('merchant')
        }
        reject(new Error(body.message || '图片上传失败，请重试'))
      },
      fail: () => reject(new Error('图片上传失败，请检查 Spring Boot 服务后重试')),
    })
  })
}

export async function uploadProductImage(
  path: string,
  purpose: 'product' | 'review' = 'product',
): Promise<string> {
  const session = getDemoSession()
  const role = purpose === 'review' ? 'user' : 'merchant'
  if (session?.role !== role)
    throw new Error(purpose === 'review' ? '请先登录用户账号' : '请先登录商家账号')
  if (springMarketplaceEnabled && purpose === 'product') return uploadSpringImage(path, session.token)
  let data = ''
  // #ifdef H5
  const blob = await fetch(path).then((response) => response.blob())
  if (blob.size > 2 * 1024 * 1024) throw new Error('请选择不超过 2 MB 的图片')
  data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(new Error('无法读取图片，请重新选择'))
    reader.readAsDataURL(blob)
  })
  // #endif
  // #ifdef MP-WEIXIN
  data = await new Promise<string>((resolve, reject) => {
    uni.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'base64',
      success: (result) => resolve(String(result.data)),
      fail: () => reject(new Error('无法读取图片，请重新选择')),
    })
  })
  // #endif
  if (!data || data.length > 2_800_000) throw new Error('请选择不超过 2 MB 的图片')
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${demoApiBase}/api/demo/${purpose === 'review' ? 'review-images' : 'images'}`,
      method: 'POST',
      data: { data },
      header: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      timeout: 15000,
      success(response) {
        const body = response.data as { url?: string; message?: string }
        if (response.statusCode === 200 && body.url) resolve(body.url)
        else {
          if (response.statusCode === 401 && getDemoSession()?.token === session.token) {
            clearDemoSession()
            openLogin(role)
          }
          reject(new Error(body.message || '图片上传失败，请重试'))
        }
      },
      fail: () => reject(new Error('图片上传失败，请检查演示服务后重试')),
    })
  })
}

export function uploadReviewImage(path: string): Promise<string> {
  return uploadProductImage(path, 'review')
}
