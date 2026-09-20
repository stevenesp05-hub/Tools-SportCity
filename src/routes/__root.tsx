import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { Toaster } from '#/components/ui/sonner'
import { DialogsProvider } from '#/components/ui/dialogs'
import { ImageFallback } from '#/components/layout/ImageFallback'
import { getCurrentUser } from '#/server/auth'
import { readCachedUser, writeCachedUser } from '#/lib/session-cache'
import type { CurrentUser } from '#/server/auth'

import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{ user: CurrentUser | null }>()(
  {
    beforeLoad: async () => {
      const inBrowser = typeof window !== 'undefined'
      const known = inBrowser ? readCachedUser() : null
      if (known) return { user: known }
      const user = await getCurrentUser()
      if (inBrowser) writeCachedUser(user)
      return { user }
    },
    head: () => ({
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content:
            'width=device-width, initial-scale=1, interactive-widget=resizes-content',
        },
        { title: 'Sport City Tools' },
        { name: 'theme-color', content: '#1e1b4b' },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        // Las fuentes de marca se piden ya, en paralelo con el CSS, en vez de esperar a que este las descubra.
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/brand/fonts/inter-latin-variable.woff2',
          crossOrigin: 'anonymous',
        },
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/brand/fonts/sora-latin-variable.woff2',
          crossOrigin: 'anonymous',
        },
        { rel: 'manifest', href: '/manifest.webmanifest' },
        {
          rel: 'icon',
          href: '/favicon-light.png',
          type: 'image/png',
          media: '(prefers-color-scheme: light)',
        },
        {
          rel: 'icon',
          href: '/favicon-dark.png',
          type: 'image/png',
          media: '(prefers-color-scheme: dark)',
        },
        { rel: 'icon', href: '/favicon.png', type: 'image/png' },
        {
          rel: 'icon',
          href: '/favicon-32.png',
          sizes: '32x32',
          type: 'image/png',
        },
        {
          rel: 'icon',
          href: '/favicon-16.png',
          sizes: '16x16',
          type: 'image/png',
        },
        // Safari solo pide /favicon.ico en la raíz.
        { rel: 'icon', href: '/favicon.ico', type: 'image/x-icon' },
        {
          rel: 'apple-touch-icon',
          href: '/apple-touch-icon.png',
          sizes: '180x180',
        },
      ],
    }),
    shellComponent: RootDocument,
  },
)

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        <DialogsProvider>{children}</DialogsProvider>
        <Toaster />
        <ImageFallback />
        <Scripts />
      </body>
    </html>
  )
}
