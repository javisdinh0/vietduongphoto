import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/ui',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:8123', locale: 'vi-VN', serviceWorkers: 'block' },
  webServer: { command: 'npx http-server . -p 8123 -c-1 -s', url: 'http://localhost:8123', reuseExistingServer: !process.env.CI },
});
