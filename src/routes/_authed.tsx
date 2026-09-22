import { useEffect, useMemo, useState } from 'react'
import {
  createFileRoute,
  redirect,
  Link,
  Outlet,
  useMatches,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import {
  ChevronRight,
  ClipboardList,
  Folder,
  Home,
  Trash2,
  Users,
  LogOut,
  PanelLeft,
} from 'lucide-react'
import { logout } from '#/server/auth'
import { clearCachedUser } from '#/lib/session-cache'
import { listFolders } from '#/server/documents'
import type { DocumentDetail } from '#/server/documents'
import { folderChainOf } from '#/lib/breadcrumbs'
import { ROLE_LABELS, hasPermission } from '#/lib/permissions'
import { Button } from '#/components/ui/button'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { GlobalSearch } from '#/components/layout/GlobalSearch'
import { NotificationsBell } from '#/components/layout/NotificationsBell'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  loader: () => listFolders(),
  component: AuthedLayout,
})

const navLinkClass =
  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-foreground/80 hover:bg-secondary'

function AuthedLayout() {
  const { user } = Route.useRouteContext()
  const folders = Route.useLoaderData()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const spaces = folders.filter((f) => f.parent_id === null)
  const currentFolderId =
    pathname.startsWith('/documentos/') &&
    !pathname.startsWith('/documentos/doc/')
      ? pathname.split('/')[2]
      : null
  const folderChain = useMemo(
    () => folderChainOf(folders, currentFolderId),
    [folders, currentFolderId],
  )
  const activeSpaceId = folderChain[0]?.id ?? null
  const router = useRouter()

  // El documento abierto (si lo hay): su título y carpeta, para la ruta de la barra superior.
  const openDocument = useMatches({
    select: (matches) =>
      (
        matches.find((m) => m.routeId === '/_authed/documentos/doc/$docId') as
          { loaderData?: { document: DocumentDetail } } | undefined
      )?.loaderData?.document,
  })
  const crumbs = useMemo(() => {
    const section: Record<string, string> = {
      '/documentos/papelera': 'Papelera',
      '/auditoria': 'Auditoría',
      '/administracion': 'Administración',
      '/buscar': 'Buscar',
    }
    if (section[pathname]) return [{ label: section[pathname] }]
    if (pathname.startsWith('/documentos/doc/')) {
      if (!openDocument) return []
      return [
        ...folderChainOf(folders, openDocument.folder_id).map((f) => ({
          label: f.name,
          folderId: f.id,
        })),
        { label: openDocument.title.trim() || 'Documento sin título' },
      ]
    }
    if (pathname === '/documentos') return []
    return folderChain.map((f) => ({ label: f.name, folderId: f.id }))
  }, [pathname, openDocument, folders, folderChain])

  const [sidebarOpen, setSidebarOpen] = useState(true)
  // En pantallas estrechas la barra lateral es un cajón sobre el contenido (no lo empuja) y se cierra al navegar.
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sc-sidebar')
      // Sin preferencia guardada, en pantallas pequeñas la barra empieza recogida.
      setSidebarOpen(
        stored === null ? window.innerWidth >= 1024 : stored !== 'closed',
      )
    } catch {
      /* sin almacenamiento: barra abierta */
    }
  }, [])
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)')
    const sync = () => {
      setNarrow(query.matches)
      if (query.matches) setSidebarOpen(false)
    }
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  useEffect(() => {
    if (narrow) setSidebarOpen(false)
  }, [pathname, narrow])
  function toggleSidebar() {
    setSidebarOpen((open) => {
      // La preferencia guardada es la del escritorio; el cajón del móvil no la cambia.
      if (!narrow) {
        try {
          localStorage.setItem('sc-sidebar', open ? 'closed' : 'open')
        } catch {
          /* preferencia no persistida */
        }
      }
      return !open
    })
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  async function handleLogout() {
    await logout()
    clearCachedUser()
    await router.invalidate()
    await router.navigate({ to: '/login', search: { redirect: '/documentos' } })
  }

  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase()

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {narrow && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside
        data-app-sidebar
        className={cn(
          'flex flex-none flex-col overflow-hidden border-r border-border bg-card',
          narrow
            ? cn(
                'fixed inset-y-0 left-0 z-50 w-[min(18rem,86vw)] shadow-lg transition-transform duration-200',
                sidebarOpen ? 'translate-x-0' : '-translate-x-full',
              )
            : cn(
                'transition-[width] duration-200',
                sidebarOpen ? 'w-72' : 'w-0 border-r-0',
              ),
        )}
        inert={!sidebarOpen}
      >
        <div className="flex h-full w-72 flex-none flex-col">
          <div className="flex items-center gap-3 px-6 py-7">
            <img src="/brand/logo-mark.png" alt="" className="h-9 w-auto" />
            <span className="flex flex-col leading-none text-primary">
              <span className="font-display text-lg font-bold tracking-tight">
                Sport City
              </span>
              <span className="mt-1 text-2xs font-medium uppercase tracking-[0.18em] opacity-70">
                Club
              </span>
            </span>
          </div>
          <div className="px-6 pb-3 text-2xs font-display uppercase tracking-[0.18em] text-muted-foreground">
            Tools
          </div>
          <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4">
            <Link
              to="/documentos"
              activeOptions={{ exact: true }}
              className={cn(
                navLinkClass,
                '[&.is-active]:bg-secondary [&.is-active]:text-primary',
              )}
              activeProps={{ className: 'is-active' }}
            >
              <Home className="size-5" />
              Inicio
            </Link>
            {spaces.map((space) => (
              <Link
                key={space.id}
                to="/documentos/$folderId"
                params={{ folderId: space.id }}
                className={cn(
                  navLinkClass,
                  activeSpaceId === space.id && 'bg-secondary text-primary',
                )}
              >
                <Folder className="size-5" />
                {space.name}
              </Link>
            ))}
            {hasPermission(user?.role, 'tools.documentos.editar') && (
              <Link
                to="/documentos/papelera"
                className={cn(
                  navLinkClass,
                  '[&.is-active]:bg-secondary [&.is-active]:text-primary',
                )}
                activeProps={{ className: 'is-active' }}
              >
                <Trash2 className="size-5" />
                Papelera
              </Link>
            )}
            {hasPermission(user?.role, 'tools.admin.ver_auditoria') && (
              <Link
                to="/auditoria"
                className={cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-foreground/80 hover:bg-secondary',
                  '[&.is-active]:bg-secondary [&.is-active]:text-primary',
                )}
                activeProps={{ className: 'is-active' }}
              >
                <ClipboardList className="size-5" />
                Auditoría
              </Link>
            )}
            {hasPermission(user?.role, 'tools.admin.gestionar_usuarios') && (
              <Link
                to="/administracion"
                className={cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-foreground/80 hover:bg-secondary',
                  '[&.is-active]:bg-secondary [&.is-active]:text-primary',
                )}
                activeProps={{ className: 'is-active' }}
              >
                <Users className="size-5" />
                Administración
              </Link>
            )}
          </nav>
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-3 rounded-xl px-2 py-2.5">
              <Avatar className="size-10">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {user?.email}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {user ? ROLE_LABELS[user.role] : ''}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                onClick={handleLogout}
                title="Salir"
              >
                <LogOut className="size-4.5" />
              </Button>
            </div>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          data-app-topbar
          className="flex flex-none items-center gap-3 border-b border-border bg-card px-4 py-3.5 sm:px-6"
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-9 flex-none"
            onClick={toggleSidebar}
            aria-label={
              sidebarOpen
                ? 'Recoger la barra lateral'
                : 'Mostrar la barra lateral'
            }
            title={
              sidebarOpen
                ? 'Recoger la barra lateral'
                : 'Mostrar la barra lateral'
            }
          >
            <PanelLeft className="size-5" />
          </Button>
          {crumbs.length > 0 && (
            <nav
              aria-label="Ruta"
              className="hidden min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm text-muted-foreground md:flex"
            >
              <Link
                to="/documentos"
                className="flex-none rounded-md px-1.5 py-0.5 font-medium hover:bg-secondary hover:text-foreground"
              >
                Inicio
              </Link>
              {crumbs.map((crumb, index) => (
                <span
                  key={'folderId' in crumb ? crumb.folderId : index}
                  className="flex min-w-0 items-center gap-1"
                >
                  <ChevronRight className="size-3.5 flex-none" />
                  {'folderId' in crumb ? (
                    <Link
                      to="/documentos/$folderId"
                      params={{ folderId: crumb.folderId }}
                      className="truncate rounded-md px-1.5 py-0.5 font-medium hover:bg-secondary hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className="truncate px-1.5 py-0.5 font-medium text-foreground"
                      title={crumb.label}
                    >
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <div className="shrink-0">
            <GlobalSearch />
          </div>
          <div className="ml-auto">
            <NotificationsBell />
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
