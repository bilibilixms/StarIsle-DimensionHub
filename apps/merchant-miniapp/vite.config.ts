import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { resolve } from 'node:path'
import { prepareMiniapp } from '../../scripts/prepare-miniapp.mjs'
const aliases = prepareMiniapp(__dirname)
export default defineConfig({
  plugins: [uni()],
  resolve: { alias: aliases },
  server: { strictPort: true },
})
