import { demoApiBase, getDemoSession, clearDemoSession, openLogin } from './auth'
import { springMarketplaceEnabled } from './spring-api'
import { uploadSpringMedia } from './spring-media'

export async function uploadProductVideo(path: string): Promise<string> {
  const session = getDemoSession()
  if (session?.role !== 'merchant') throw new Error('请先登录商家账号')
  if (springMarketplaceEnabled) return uploadSpringMedia(path, session.token, 'productVideo')
  let data = ''
  // #ifdef H5
  const blob = await fetch(path).then((response) => response.blob())
  if (blob.size > 20 * 1024 * 1024) throw new Error('视频不能超过 20 MB')
  data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(new Error('无法读取视频，请重新选择'))
    reader.readAsDataURL(blob)
  })
  // #endif
  // #ifdef MP-WEIXIN
  data = await new Promise<string>((resolve, reject) => {
    uni.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'base64',
      success: (result) => resolve(String(result.data)),
      fail: () => reject(new Error('无法读取视频，请重新选择')),
    })
  })
  // #endif
  if (!data || data.length > Math.ceil((20 * 1024 * 1024) / 3) * 4)
    throw new Error('请选择不超过 20 MB 的视频')
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${demoApiBase}/api/demo/videos`,
      method: 'POST',
      data: { data },
      header: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      timeout: 120000,
      success(response) {
        const body = response.data as { url?: string; message?: string }
        if (response.statusCode === 200 && body.url) resolve(body.url)
        else {
          if (response.statusCode === 401 && getDemoSession()?.token === session.token) {
            clearDemoSession()
            openLogin('merchant')
          }
          reject(new Error(body.message || '视频上传失败，请重试'))
        }
      },
      fail: () => reject(new Error('视频上传失败，请检查服务连接后重试')),
    })
  })
}
