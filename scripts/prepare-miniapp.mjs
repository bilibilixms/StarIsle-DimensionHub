import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Keep both preview builds on the same pages while respecting UNI_INPUT_DIR.
export function prepareMiniapp(appRoot) {
  const root = resolve(appRoot, '../..')
  const ui = resolve(appRoot, 'src/generated/ui')
  const user = resolve(appRoot, 'src/generated/user')
  mkdirSync(ui, { recursive: true })
  mkdirSync(user, { recursive: true })
  for (const file of readdirSync(resolve(root, 'packages/ui/src')))
    if (/\.(vue|css|ts)$/.test(file))
      copyFileSync(resolve(root, 'packages/ui/src', file), resolve(ui, file))
  copyFileSync(
    resolve(root, 'apps/merchant-miniapp/src/components/MerchantWorkspace.vue'),
    resolve(ui, 'MerchantWorkspace.vue'),
  )
  for (const file of readdirSync(resolve(root, 'apps/user-miniapp/src/components')))
    if (file.endsWith('.vue'))
      copyFileSync(resolve(root, 'apps/user-miniapp/src/components', file), resolve(user, file))
  return { '@starisle/ui': ui, '@starisle/user': user }
}
