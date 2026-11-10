import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  workers: 1,
  timeout: 45_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5184',
    viewport: { width: 1440, height: 960 },
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
  },
  outputDir: 'test-results/browser',
  webServer: {
    command: 'VITE_API_MODE=http npm run dev -- --port 5184',
    url: 'http://127.0.0.1:5184',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
