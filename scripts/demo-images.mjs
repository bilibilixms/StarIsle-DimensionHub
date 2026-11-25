import sharp from 'sharp'
import { DemoDomainError, DEMO_ASSETS } from '../packages/shared/src/demo-domain.ts'

export const imagePathPattern = /^\/api\/demo\/images\/([a-f0-9-]{36})\.jpg$/

export function normalizeProductImages(command, store, ownerId) {
  const result = { ...command }
  const normalize = (value) => {
    if (Object.values(DEMO_ASSETS).includes(value)) return value
    if (typeof value !== 'string') throw new DemoDomainError('商品图片无效')
    let path = value
    if (/^https?:\/\//.test(value)) {
      try {
        path = new URL(value).pathname
      } catch {
        throw new DemoDomainError('商品图片无效')
      }
    }
    const id = imagePathPattern.exec(path)?.[1]
    if (!id || store.images?.[id]?.ownerId !== ownerId || store.images?.[id]?.purpose === 'review')
      throw new DemoDomainError('请使用本店上传的商品图片', 403)
    return path
  }
  if (command.images !== undefined) {
    if (!Array.isArray(command.images)) throw new DemoDomainError('商品图片无效')
    result.images = command.images.map(normalize)
  }
  if (command.cover !== undefined) result.cover = normalize(command.cover)
  return result
}

export async function decodeProductImage(data) {
  if (
    typeof data !== 'string' ||
    !data.length ||
    data.length > 2_800_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
  )
    throw new DemoDomainError('请选择不超过 2 MB 的 JPG、PNG 或 WebP 图片')
  const input = Buffer.from(data, 'base64')
  if (input.length > 2 * 1024 * 1024) throw new DemoDomainError('商品图片不能超过 2 MB')
  try {
    const image = sharp(input, { limitInputPixels: 25_000_000 })
    const metadata = await image.metadata()
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1)
      throw new Error('unsupported image')
    return await image
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer()
  } catch {
    throw new DemoDomainError('无法读取图片，请选择 JPG、PNG 或 WebP 静态图片')
  }
}

export function normalizeReviewImages(command, store, ownerId) {
  const images = command.images ?? []
  if (!Array.isArray(images) || images.length > 3)
    throw new DemoDomainError('评价最多上传 3 张图片')
  return {
    ...command,
    images: images.map((value) => {
      if (typeof value !== 'string') throw new DemoDomainError('评价图片无效')
      let path = value
      if (/^https?:\/\//.test(path)) {
        try {
          path = new URL(path).pathname
        } catch {
          throw new DemoDomainError('评价图片无效')
        }
      }
      const id = imagePathPattern.exec(path)?.[1]
      if (!id || store.images?.[id]?.ownerId !== ownerId || store.images[id].purpose !== 'review')
        throw new DemoDomainError('请使用自己上传的评价图片', 403)
      return path
    }),
  }
}
