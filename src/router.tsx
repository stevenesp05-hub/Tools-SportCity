import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import {
  ErrorPage,
  NotFoundPage,
  PendingPage,
} from '#/components/layout/ErrorPages'
import type { CurrentUser } from '#/server/auth'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Lo precargado al pasar el ratón por un enlace se reutiliza si el clic llega en 10 s.
    // Cualquier router.invalidate() tras un cambio lo descarta.
    defaultPreloadStaleTime: 10_000,
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: ErrorPage,
    defaultPendingComponent: PendingPage,
    defaultPendingMs: 400,
    defaultPendingMinMs: 0,
    context: {
      user: null as CurrentUser | null,
    },
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
