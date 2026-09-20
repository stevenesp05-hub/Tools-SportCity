import type { DocTheme } from '#/lib/doc-themes'
import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router'
import {
  listDocuments,
  listTemplates,
  createFolder,
  createDocument,
} from '#/server/documents'
import { hasPermission } from '#/lib/permissions'
import type { Role } from '#/lib/permissions'
import { FolderBrowser } from '#/components/documents/FolderBrowser'

export const Route = createFileRoute('/_authed/documentos/$folderId')({
  // Las carpetas ya las carga el layout /_authed; las plantillas se piden al abrir "Nuevo documento".
  loader: ({ params }) =>
    listDocuments({ data: { folderId: params.folderId } }),
  component: FolderPage,
})

const authedRoute = getRouteApi('/_authed')

function FolderPage() {
  const { folderId } = Route.useParams()
  const documents = Route.useLoaderData()
  const folders = authedRoute.useLoaderData()
  const { user } = Route.useRouteContext()
  const router = useRouter()

  async function handleCreateFolder(name: string, visibleRoles: Role[] | null) {
    await createFolder({ data: { name, parentId: folderId, visibleRoles } })
    await router.invalidate()
  }

  async function handleCreateDocument(
    title: string,
    templateId: string | null,
    variables: Record<string, string>,
    theme: DocTheme,
  ) {
    const doc = await createDocument({
      data: { folderId, title, templateId, variables, theme },
    })
    await router.navigate({
      to: '/documentos/doc/$docId',
      params: { docId: doc.id },
      search: { editar: true },
    })
  }

  return (
    <FolderBrowser
      folders={folders}
      documents={documents}
      loadTemplates={() => listTemplates({ data: { folderId } })}
      currentFolderId={folderId}
      canCreate={hasPermission(user?.role, 'tools.documentos.crear')}
      canEdit={hasPermission(user?.role, 'tools.documentos.editar')}
      canDelete={hasPermission(user?.role, 'tools.documentos.eliminar')}
      canManageAccess={hasPermission(
        user?.role,
        'tools.admin.gestionar_acceso',
      )}
      onCreateFolder={handleCreateFolder}
      onCreateDocument={handleCreateDocument}
    />
  )
}
