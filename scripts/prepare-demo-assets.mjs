import sharp from 'sharp'
import { mkdir, copyFile, writeFile, readdir, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve(process.argv[2] || '.tools/imagegen')
const targets = ['apps/user-miniapp', 'apps/merchant-miniapp']
const assets = [
  ['hero.png', 'star-island.jpg'],
  ['figurine.png', 'star-fairy.jpg'],
]
const icons = {
  sparkles:
    '<path d="m12 3 2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1L12 3Z"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
  cart: '<path d="M2 3h3l2.5 12h11L21 7H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  bag: '<rect x="4" y="7" width="16" height="15" rx="3"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>',
  brush: '<path d="m14 4 6-2 2 6-9 9-6-6 7-7Z"/><path d="M10 15c-1 6-5 6-8 7 1-2 0-6 4-7"/>',
  ticket:
    '<path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z"/><path d="M15 5v3m0 3v2m0 3v3"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM9 21h6"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  'chevron-left': '<path d="m15 5-7 7 7 7"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  receipt: '<path d="M5 3h14v19l-3-2-4 2-4-2-3 2V3Z"/><path d="M9 8h6m-6 4h6m-6 4h3"/>',
  truck:
    '<path d="M1 4h13v13H1V4Zm13 5h4l4 5v3h-8"/><circle cx="5" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  minus: '<path d="M4 12h16"/>',
  share: '<path d="M12 16V2m-5 5 5-5 5 5M5 12H3v10h18V12h-2"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="m10 2-.7 3-2.5 1L4 5 2 9l2 2v2l-2 2 2 4 3-1 2 1 1 3h4l1-3 2-1 3 1 2-4-2-2v-2l2-2-2-4-3 1-2-1-1-3h-4Z"/>',
  refund: '<path d="M3 10a9 9 0 1 1 2 9M3 3v7h7"/><path d="m9 8 3 4 3-4m-3 4v6m-3-3h6"/>',
  chart: '<path d="M3 3v18h18M7 16v-4m5 4V8m5 8V5"/>',
  message:
    '<path d="M21 11a9 9 0 0 1-9 9H5l-4 3 2-7a9 9 0 1 1 18-5Z"/><path d="M7 10h10m-10 4h6"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1 3-6Z"/>',
}
const tones = {
  purple: '#8b5cf6',
  muted: '#9d95aa',
  ink: '#493c5c',
  pink: '#ed83a5',
  orange: '#dd9657',
  blue: '#6e9de8',
  teal: '#53b6a9',
  white: '#ffffff',
}
const usedTones = {
  sparkles: ['purple', 'orange', 'white'],
  home: ['muted', 'purple', 'orange'],
  compass: ['muted', 'purple'],
  cart: ['muted', 'purple'],
  user: ['muted', 'purple', 'orange'],
  bag: ['muted', 'purple', 'pink', 'orange'],
  brush: ['purple'],
  ticket: ['blue'],
  heart: ['muted', 'pink'],
  search: ['muted', 'purple'],
  bell: ['ink'],
  'chevron-right': ['muted', 'purple'],
  'chevron-left': ['ink'],
  arrow: ['purple'],
  receipt: ['muted', 'purple', 'orange'],
  truck: ['purple', 'blue', 'orange'],
  shield: ['muted', 'purple', 'orange'],
  pin: ['purple'],
  check: ['white'],
  plus: ['teal', 'white'],
  share: ['ink'],
  settings: ['muted', 'orange'],
  refund: ['pink'],
  message: ['purple'],
}
for (const app of targets) {
  const assetDir = resolve(app, 'src/static/demo')
  const iconDir = resolve(app, 'src/static/icons')
  await mkdir(assetDir, { recursive: true })
  await mkdir(iconDir, { recursive: true })
  for (const [input, output] of assets) {
    if (app === targets[0])
      await sharp(resolve(source, input))
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(resolve(assetDir, output))
    else await copyFile(resolve(targets[0], 'src/static/demo', output), resolve(assetDir, output))
  }
  const requiredFiles = new Set(
    Object.entries(usedTones).flatMap(([name, colors]) =>
      colors.map((tone) => `${name}-${tone}.svg`),
    ),
  )
  for (const file of await readdir(iconDir)) {
    if (
      /^[a-z-]+-(purple|muted|ink|pink|orange|blue|teal|white)\.svg$/.test(file) &&
      !requiredFiles.has(file)
    )
      await unlink(resolve(iconDir, file))
  }
  for (const [name, paths] of Object.entries(icons))
    for (const tone of usedTones[name] || []) {
      const color = tones[tone]
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
      await writeFile(resolve(iconDir, `${name}-${tone}.svg`), svg)
    }
}
console.log('Prepared local artwork and SVG icon assets for both miniapps')
