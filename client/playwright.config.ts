import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173' },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'npx tsx src/e2e.ts',
          cwd: '../server',
          url: 'http://localhost:3101/api/health',
          reuseExistingServer: false,
        },
        {
          command: 'npm run dev',
          url: 'http://localhost:5173',
          reuseExistingServer: false,
          env: { VITE_PROXY_TARGET: 'http://localhost:3101' },
        },
      ],
  workers: 1,
});
