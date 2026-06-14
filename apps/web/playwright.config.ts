import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  webServer: {
    command: `npx next dev -H 0.0.0.0 -p ${port}`,
    port,
    reuseExistingServer: false,
  },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...devices['iPhone 13'],
  },
});
