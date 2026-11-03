import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react()],
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
