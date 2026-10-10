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
  FolderOpen,
  Home,
  Briefcase,
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
import { GESTION_SECTIONS, TINT_CLASSES } from '#/components/gestion/GestionNav'
import type { Tint } from '#/components/gestion/GestionNav'
import type { LucideIcon } from 'lucide-react'

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
  'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground/75 transition-all duration-200 hover:bg-primary/[0.07] hover:text-primary hover:translate-x-0.5'

/** Enlace activo: fondo suave y una barra de color a la izquierda. */
const navActive =
  '[&.is-active]:bg-primary/10 [&.is-active]:font-semibold [&.is-active]:text-primary [&.is-active]:shadow-[inset_3px_0_0_0_var(--primary)]'

const navActiveStatic =
  'bg-primary/10 font-semibold text-primary shadow-[inset_3px_0_0_0_var(--primary)]'

/** Icono dentro de una ficha de color; crece un poco al pasar el ratón. */
function NavIcon({
  icon: Icon,
  tint,
  small = false,
}: {
  icon: LucideIcon
  tint: Tint
  small?: boolean
}) {
  return (
    <span
      className={cn(
        'flex flex-none items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110',
        small ? 'size-7' : 'size-8',
        TINT_CLASSES[tint],
      )}
    >
      <Icon className={small ? 'size-3.5' : 'size-4'} />
    </span>
  )
}

function AuthedLayout() {
  const { user } = Route.useRouteContext()
  const folders = Route.useLoaderData()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const spaces = folders.filter((f) => f.parent_id === null)
  const docsActive = pathname.startsWith('/documentos/')
  // «Documentos» agrupa los espacios y la papelera; recuerda si el usuario lo dejó cerrado.
  const [docsOpen, setDocsOpen] = useState(true)
  useEffect(() => {
    try {
      if (localStorage.getItem('sc:sidebar-documentos') === 'closed')
        setDocsOpen(false)
    } catch {
      /* sin almacenamiento: se queda abierto */
    }
  }, [])
  // Al entrar a una carpeta o documento, el grupo se abre para ver dónde estás.
  useEffect(() => {
    if (docsActive) setDocsOpen(true)
  }, [docsActive])
  const docsExpanded = docsOpen
  const gestionActive = pathname.startsWith('/gestion')
  const [gestionOpen, setGestionOpen] = useState(false)
  useEffect(() => {
    if (gestionActive) setGestionOpen(true)
  }, [gestionActive])
  const toggleDocs = () => {
    const next = !docsExpanded
    setDocsOpen(next)
    try {
      localStorage.setItem('sc:sidebar-documentos', next ? 'open' : 'closed')
    } catch {
      /* no pasa nada si no se puede guardar */
    }
  }
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
    // Gestión: «Gestión > OKR», como el resto de rutas.
    if (pathname === '/gestion') return [{ label: 'Gestión' }]
    const gestion = GESTION_SECTIONS.find((g) => g.to === pathname)
    if (gestion)
      return [
        { label: 'Gestión', to: '/gestion' as const },
        { label: gestion.label },
      ]
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
  useEffect(() => {
    // Al abrir un documento se recoge sola para darle más ancho: se puede volver a mostrar con el
    // mismo botón, solo empieza recogida.
    if (pathname.startsWith('/documentos/doc/')) setSidebarOpen(false)
  }, [pathname])
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
    <div className="app-shell flex h-dvh overflow-hidden">
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
          'flex flex-none flex-col overflow-hidden',
          narrow
            ? cn(
                'fixed inset-y-0 left-0 z-50 w-[min(19rem,92vw)] transition-transform duration-200',
                sidebarOpen ? 'translate-x-0' : '-translate-x-full',
              )
            : cn(
                'transition-[width] duration-200',
                sidebarOpen ? 'w-[19rem]' : 'w-0',
              ),
        )}
        inert={!sidebarOpen}
      >
        <div className="glass m-3 flex h-[calc(100%-1.5rem)] w-[17.5rem] flex-none flex-col overflow-hidden rounded-2xl">
          <div className="flex items-center gap-3 px-5 pb-4 pt-6">
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
          <div className="px-5 pb-2 text-2xs font-display uppercase tracking-[0.18em] text-muted-foreground">
            Tools
          </div>
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3">
            <Link
              to="/documentos"
              activeOptions={{ exact: true }}
              className={cn(navLinkClass, navActive)}
              activeProps={{ className: 'is-active' }}
            >
              <NavIcon icon={Home} tint="indigo" />
              Inicio
            </Link>
            {hasPermission(user?.role, 'tools.okr.ver') && (
              <div>
                <button
                  type="button"
                  aria-expanded={gestionOpen}
                  aria-controls="sidebar-gestion"
                  onClick={() => setGestionOpen((o) => !o)}
                  className={cn(
                    navLinkClass,
                    'w-full text-left',
                    gestionActive && !gestionOpen && navActiveStatic,
                  )}
                >
                  <NavIcon icon={Briefcase} tint="violet" />
                  <span className="flex-1">Gestión</span>
                  <ChevronRight
                    className={cn(
                      'size-4 text-muted-foreground transition-transform duration-200',
                      gestionOpen && 'rotate-90',
                    )}
                  />
                </button>
                {gestionOpen && (
                  <div
                    id="sidebar-gestion"
                    className="mt-1 ml-[1.15rem] space-y-0.5 border-l border-border/70 pl-2"
                  >
                    {GESTION_SECTIONS.map((section) => (
                      <Link
                        key={section.to}
                        to={section.to}
                        activeOptions={{ exact: section.to === '/gestion' }}
                        className={cn(navLinkClass, 'py-1.5', navActive)}
                        activeProps={{ className: 'is-active' }}
                      >
                        <NavIcon
                          icon={section.icon}
                          tint={section.tint}
                          small
                        />
                        {section.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div>
              <button
                type="button"
                aria-expanded={docsExpanded}
                aria-controls="sidebar-documentos"
                onClick={toggleDocs}
                className={cn(
                  navLinkClass,
                  'w-full text-left',
                  docsActive && !docsExpanded && navActiveStatic,
                )}
              >
                <NavIcon
                  icon={docsExpanded ? FolderOpen : Folder}
                  tint="blue"
                />
                <span className="flex-1">Documentos</span>
                <ChevronRight
                  className={cn(
                    'size-4 text-muted-foreground transition-transform duration-200',
                    docsExpanded && 'rotate-90',
                  )}
                />
              </button>
              {docsExpanded && (
                <div
                  id="sidebar-documentos"
                  className="mt-1 ml-[1.15rem] space-y-0.5 border-l border-border/70 pl-2"
                >
                  {spaces.map((space) => (
                    <Link
                      key={space.id}
                      to="/documentos/$folderId"
                      params={{ folderId: space.id }}
                      className={cn(
                        navLinkClass,
                        'py-1.5',
                        activeSpaceId === space.id && navActiveStatic,
                      )}
                    >
                      <NavIcon icon={Folder} tint="blue" small />
                      <span className="truncate">{space.name}</span>
                    </Link>
                  ))}
                  {hasPermission(user?.role, 'tools.documentos.editar') && (
                    <Link
                      to="/documentos/papelera"
                      className={cn(navLinkClass, 'py-1.5', navActive)}
                      activeProps={{ className: 'is-active' }}
                    >
                      <NavIcon icon={Trash2} tint="slate" small />
                      Papelera
                    </Link>
                  )}
                </div>
              )}
            </div>
            {hasPermission(user?.role, 'tools.admin.ver_auditoria') && (
              <Link
                to="/auditoria"
                className={cn(navLinkClass, navActive)}
                activeProps={{ className: 'is-active' }}
              >
                <NavIcon icon={ClipboardList} tint="amber" />
                Auditoría
              </Link>
            )}
            {hasPermission(user?.role, 'tools.admin.gestionar_usuarios') && (
              <Link
                to="/administracion"
                className={cn(navLinkClass, navActive)}
                activeProps={{ className: 'is-active' }}
              >
                <NavIcon icon={Users} tint="slate" />
                Administración
              </Link>
            )}
          </nav>
          <div className="border-t border-border/60 p-3">
            <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-primary/[0.06]">
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
          className="glass mx-3 mt-3 flex flex-none items-center gap-3 rounded-2xl px-3 py-2.5 sm:px-4"
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
                  ) : 'to' in crumb && crumb.to ? (
                    <Link
                      to={crumb.to}
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
