import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://client:5173' },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: false },
});
