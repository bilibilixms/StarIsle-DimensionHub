import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '.tools/test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [['list'], ['html', { outputFolder: '.tools/playwright-report', open: 'never' }]],
  use: {
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command:
        'node --experimental-strip-types scripts/demo-server.mjs --data .tools/test-demo/marketplace.json',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: false,
      timeout: 15000,
    },
    {
      command:
        'python3 -m http.server 4173 --bind 127.0.0.1 --directory apps/user-miniapp/dist/build/h5',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 15000,
      stdout: 'ignore',
      stderr: 'ignore',
    },
    {
      command:
        'python3 -m http.server 4174 --bind 127.0.0.1 --directory apps/merchant-miniapp/dist/build/h5',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      timeout: 15000,
      stdout: 'ignore',
      stderr: 'ignore',
    },
  ],
})
