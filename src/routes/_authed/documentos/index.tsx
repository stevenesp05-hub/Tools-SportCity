import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router'
import { createFolder } from '#/server/documents'
import { getHome } from '#/server/library'
import { hasPermission } from '#/lib/permissions'
import type { Role } from '#/lib/permissions'
import { FolderBrowser } from '#/components/documents/FolderBrowser'
import { HomeSections } from '#/components/documents/HomeSections'

export const Route = createFileRoute('/_authed/documentos/')({
  // Las carpetas ya las carga el layout /_authed.
  loader: () => getHome(),
  component: DocumentosRoot,
})

const authedRoute = getRouteApi('/_authed')

function DocumentosRoot() {
  const home = Route.useLoaderData()
  const folders = authedRoute.useLoaderData()
  const { user } = Route.useRouteContext()
  const router = useRouter()

  async function handleCreateFolder(name: string, visibleRoles: Role[] | null) {
    await createFolder({ data: { name, parentId: null, visibleRoles } })
    await router.invalidate()
  }

  return (
    <FolderBrowser
      folders={folders}
      documents={[]}
      currentFolderId={null}
      canCreate={hasPermission(user?.role, 'tools.documentos.crear')}
      canEdit={hasPermission(user?.role, 'tools.documentos.editar')}
      canDelete={hasPermission(user?.role, 'tools.documentos.eliminar')}
      canManageAccess={hasPermission(
        user?.role,
        'tools.admin.gestionar_acceso',
      )}
      topSlot={
        <HomeSections
          userName={
            (user?.email ?? '').split('@')[0].replace(/[._]/g, ' ') ||
            'bienvenido'
          }
          favorites={home.favorites}
          recents={home.recents}
          due={home.due}
        />
      }
      onCreateFolder={handleCreateFolder}
    />
  )
}
