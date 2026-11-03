import { defineConfig } from '@playwright/test'

// End-to-end tests run against the production build in the installed Microsoft
// Edge (no browser download needed). Run with: npm run test:e2e
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    channel: 'msedge',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
  },
})
