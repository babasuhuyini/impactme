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
    // Every test starts past the Welcome screen, as if it had been dismissed.
    // tests/e2e/account.spec.js clears this to test the Welcome itself.
    storageState: {
      cookies: [],
      origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'impactme.welcomeDismissed', value: '1' }] }],
    },
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
  },
})
