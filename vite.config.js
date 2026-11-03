import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Our own service worker (src/sw.js), since it also handles reminders.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      // New versions wait for you to press "Update" (see src/pwa.js).
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        id: './',
        name: 'ImpactMe',
        short_name: 'ImpactMe',
        description: 'Your personal space to plan, organize, reflect and grow.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        categories: ['productivity', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Today', url: './#/tasks/today', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Calendar', url: './#/calendar', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      // The service worker is only built for production; in development the app runs without it.
      devOptions: { enabled: false },
    }),
  ],
  // Relative asset paths so the build works from any sub-folder, e.g. username.github.io/impactme/.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    // Saved entries live in the browser under this exact address, so never drift to another port.
    port: 5173,
    strictPort: true,
  },
  test: {
    include: ['src/**/*.test.js'],
  },
})
