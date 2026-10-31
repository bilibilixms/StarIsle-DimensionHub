import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// The mini-program compiler requires Vue component sources inside UNI_INPUT_DIR.
const sharedUi = resolve(__dirname, 'src/generated/ui')
mkdirSync(sharedUi, { recursive: true })
for (const file of [
  'Icon.vue',
  'AppHeader.vue',
  'BottomNav.vue',
  'Sheet.vue',
  'SyncStatus.vue',
  'useDemoSync.ts',
  'theme.css',
]) {
  copyFileSync(resolve(__dirname, '../../packages/ui/src', file), resolve(sharedUi, file))
}

export default defineConfig({
  plugins: [uni()],
  resolve: { alias: { '@starisle/ui': sharedUi } },
  server: { strictPort: true },
})
