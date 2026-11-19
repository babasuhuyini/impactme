import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Content Security Policy for the built app. GitHub Pages can't send security
// headers, so it goes in a <meta> tag. The Supabase session lives in local
// storage, so blocking injected scripts protects accounts. Turnstile (the
// CAPTCHA) needs Cloudflare's script and frame. Not applied in development,
// where Vite relies on inline scripts.
function contentSecurityPolicy(mode) {
  const { VITE_SUPABASE_URL } = loadEnv(mode, process.cwd(), 'VITE_')
  const supabase = VITE_SUPABASE_URL ? new URL(VITE_SUPABASE_URL).origin : ''
  const policy = [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    `connect-src 'self'${supabase ? ` ${supabase}` : ''}`,
    'frame-src https://challenges.cloudflare.com',
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
  return {
    name: 'impactme-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ],
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    contentSecurityPolicy(mode),
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
  build: {
    // Keep fonts as files: the Content Security Policy allows fonts from
    // 'self' only, so an inlined data: font would be blocked.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
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
    // The first test in each file also pays for starting its worker, which
    // can pass the 5-second default when this machine is busy.
    testTimeout: 15000,
  },
}))
