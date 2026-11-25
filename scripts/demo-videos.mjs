import { DemoDomainError } from '../packages/shared/src/demo-domain.ts'

export const MAX_VIDEO_BYTES = 20 * 1024 * 1024
export const MAX_VIDEO_BASE64 = Math.ceil(MAX_VIDEO_BYTES / 3) * 4
export const videoPathPattern = /^\/api\/demo\/videos\/([a-f0-9-]{36})\.mp4$/

// Read bounded ISO-BMFF metadata; media bytes are preserved without transcoding.
function boxes(buffer, start = 0, end = buffer.length) {
  const result = []
  for (let pos = start; pos < end;) {
    if (pos + 8 > end) throw new Error('truncated box')
    let size = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    let header = 8
    if (size === 1) {
      if (pos + 16 > end) throw new Error('truncated large box')
      size = Number(buffer.readBigUInt64BE(pos + 8))
      header = 16
    } else if (size === 0) size = end - pos
    if (!Number.isSafeInteger(size) || size < header || pos + size > end)
      throw new Error('invalid box size')
    result.push({ type, start: pos + header, end: pos + size })
    pos += size
  }
  return result
}
function child(buffer, parent, type) {
  const found = boxes(buffer, parent.start, parent.end).find((box) => box.type === type)
  if (!found) throw new Error(`missing ${type}`)
  return found
}
export function decodeProductVideo(data) {
  if (
    typeof data !== 'string' ||
    !data.length ||
    data.length > MAX_VIDEO_BASE64 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
  )
    throw new DemoDomainError('请选择不超过 20 MB 的 MP4 视频')
  const input = Buffer.from(data, 'base64')
  if (input.length > MAX_VIDEO_BYTES) throw new DemoDomainError('商品视频不能超过 20 MB')
  try {
    const top = boxes(input)
    if (
      !top.some((box) => box.type === 'ftyp') ||
      !top.some((box) => box.type === 'mdat' && box.end > box.start)
    )
      throw new Error('not mp4')
    const moov = top.find((box) => box.type === 'moov')
    if (!moov) throw new Error('missing moov')
    const tracks = boxes(input, moov.start, moov.end).filter((box) => box.type === 'trak')
    const timing = new Map()
    let duration = 0
    let videoFound = false
    for (const track of tracks) {
      const mdia = child(input, track, 'mdia')
      const hdlr = child(input, mdia, 'hdlr')
      if (hdlr.start + 12 > hdlr.end) throw new Error('invalid handler')
      const handler = input.toString('ascii', hdlr.start + 8, hdlr.start + 12)
      if (handler !== 'vide' && handler !== 'soun') continue
      const mdhd = child(input, mdia, 'mdhd')
      const version = input[mdhd.start]
      if (version !== 0 && version !== 1) throw new Error('invalid version')
      const timeOffset = mdhd.start + (version === 1 ? 20 : 12)
      if (timeOffset + (version === 1 ? 12 : 8) > mdhd.end) throw new Error('invalid timing')
      const timescale = input.readUInt32BE(timeOffset)
      const ticks =
        version === 1
          ? Number(input.readBigUInt64BE(timeOffset + 4))
          : input.readUInt32BE(timeOffset + 4)
      const seconds = ticks / timescale
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60)
        throw new Error('invalid duration')
      duration = Math.max(duration, seconds)
      const tkhd = child(input, track, 'tkhd')
      const trackIdOffset = tkhd.start + (input[tkhd.start] === 1 ? 20 : 12)
      if (trackIdOffset + 4 > tkhd.end) throw new Error('invalid track')
      timing.set(input.readUInt32BE(trackIdOffset), { timescale, end: ticks, defaultDuration: 0 })
      if (handler === 'vide') {
        const stsd = child(input, child(input, child(input, mdia, 'minf'), 'stbl'), 'stsd')
        if (stsd.start + 8 > stsd.end || input.readUInt32BE(stsd.start + 4) !== 1)
          throw new Error('invalid video track')
        const entries = boxes(input, stsd.start + 8, stsd.end)
        if (entries.length !== 1 || !['avc1', 'avc3'].includes(entries[0].type))
          throw new Error('unsupported codec')
        const entry = entries[0]
        if (
          entry.start + 78 > entry.end ||
          !input.readUInt16BE(entry.start + 24) ||
          !input.readUInt16BE(entry.start + 26)
        )
          throw new Error('invalid video dimensions')
        const config = boxes(input, entry.start + 78, entry.end).find((box) => box.type === 'avcC')
        if (!config || config.end - config.start < 7) throw new Error('missing AVC configuration')
        videoFound = true
      }
    }
    const mvex = boxes(input, moov.start, moov.end).find((box) => box.type === 'mvex')
    if (mvex)
      for (const trex of boxes(input, mvex.start, mvex.end).filter((box) => box.type === 'trex')) {
        if (trex.start + 20 > trex.end) throw new Error('invalid track defaults')
        const track = timing.get(input.readUInt32BE(trex.start + 4))
        if (track) track.defaultDuration = input.readUInt32BE(trex.start + 12)
      }
    for (const moof of top.filter((box) => box.type === 'moof')) {
      for (const traf of boxes(input, moof.start, moof.end).filter((box) => box.type === 'traf')) {
        const tfhd = child(input, traf, 'tfhd')
        if (tfhd.start + 8 > tfhd.end) throw new Error('invalid fragment')
        const flags = input.readUInt32BE(tfhd.start) & 0xffffff
        const track = timing.get(input.readUInt32BE(tfhd.start + 4))
        if (!track) throw new Error('unknown fragment track')
        let offset = tfhd.start + 8 + (flags & 1 ? 8 : 0) + (flags & 2 ? 4 : 0)
        let defaultDuration = track.defaultDuration
        if (flags & 8) {
          if (offset + 4 > tfhd.end) throw new Error('missing fragment duration')
          defaultDuration = input.readUInt32BE(offset)
        }
        const tfdt = boxes(input, traf.start, traf.end).find((box) => box.type === 'tfdt')
        let decodeTime = track.end
        if (tfdt) {
          const version = input[tfdt.start]
          if (![0, 1].includes(version) || tfdt.start + (version ? 12 : 8) > tfdt.end)
            throw new Error('invalid fragment time')
          decodeTime = version
            ? Number(input.readBigUInt64BE(tfdt.start + 4))
            : input.readUInt32BE(tfdt.start + 4)
        }
        for (const trun of boxes(input, traf.start, traf.end).filter(
          (box) => box.type === 'trun',
        )) {
          if (trun.start + 8 > trun.end) throw new Error('invalid samples')
          const flags = input.readUInt32BE(trun.start) & 0xffffff
          const count = input.readUInt32BE(trun.start + 4)
          if (count > 1000000) throw new Error('too many samples')
          offset = trun.start + 8 + (flags & 1 ? 4 : 0) + (flags & 4 ? 4 : 0)
          const stride = [256, 512, 1024, 2048].filter((flag) => flags & flag).length * 4
          if (offset + stride * count > trun.end) throw new Error('truncated samples')
          if (!(flags & 256) && count && !defaultDuration)
            throw new Error('missing sample duration')
          let ticks = 0
          for (let i = 0; i < count; i++)
            ticks += flags & 256 ? input.readUInt32BE(offset + i * stride) : defaultDuration
          decodeTime += ticks
        }
        track.end = Math.max(track.end, decodeTime)
        const seconds = track.end / track.timescale
        if (!Number.isFinite(seconds) || seconds > 60) throw new Error('invalid fragment duration')
        duration = Math.max(duration, seconds)
      }
    }
    if (!videoFound || duration <= 0) throw new Error('no video track')
    return { video: input, duration }
  } catch {
    throw new DemoDomainError('无法读取视频，请选择 60 秒以内的 MP4（H.264）视频')
  }
}
export function normalizeProductVideo(command, store, ownerId) {
  if (command.video === undefined) return command
  if (command.video === '') return { ...command, video: '' }
  if (typeof command.video !== 'string') throw new DemoDomainError('商品视频无效')
  let path = command.video
  if (/^https?:\/\//.test(path)) {
    try {
      path = new URL(path).pathname
    } catch {
      throw new DemoDomainError('商品视频无效')
    }
  }
  const id = videoPathPattern.exec(path)?.[1]
  if (!id || store.videos?.[id]?.ownerId !== ownerId)
    throw new DemoDomainError('请使用本店上传的商品视频', 403)
  return { ...command, video: path }
}
