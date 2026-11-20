import { defineConfig } from '@playwright/test';
const port = Number(process.env.WFG_TEST_PORT || 5184);
export default defineConfig({
  testDir: 'tests/browser',
  workers: 1,
  timeout: 45_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 960 },
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
  },
  outputDir: 'test-results/browser',
  webServer: {
    // Explicit synthetic demo credentials for the isolated browser test server only.
    env: {
      VITE_DEMO_ACCOUNTS: process.env.VITE_DEMO_ACCOUNTS ?? 'true',
      VITE_DEMO_PASSWORD: process.env.VITE_DEMO_PASSWORD ?? 'synthetic-demo-password',
    },
    command: `VITE_API_MODE=http npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
