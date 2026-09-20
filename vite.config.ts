import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({
      // El PDF arranca Chromium: en Vercel la función necesita más tiempo y memoria, y hay que incluir
      // los binarios de @sparticuz/chromium (se cargan en tiempo de ejecución, no los ve el empaquetador).
      traceDeps: ['@sparticuz/chromium*'],
      routeRules: {
        // Las fuentes de marca no cambian de contenido bajo el mismo nombre: el navegador las guarda un año.
        '/brand/fonts/**': {
          headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        },
        '/**': {
          headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          },
        },
      },
      vercel: { functions: { maxDuration: 60, memory: 1024 } },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
