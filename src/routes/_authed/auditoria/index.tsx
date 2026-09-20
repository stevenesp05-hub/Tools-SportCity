import { createFileRoute, redirect } from '@tanstack/react-router'
import { listAuditLog } from '#/server/audit'
import { hasPermission } from '#/lib/permissions'

export const Route = createFileRoute('/_authed/auditoria/')({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.user?.role, 'tools.admin.ver_auditoria')) {
      throw redirect({ to: '/documentos' })
    }
  },
  loader: () => listAuditLog(),
  component: AuditoriaPage,
})

const ACTION_LABELS: Record<string, string> = {
  insert: 'Creó',
  update: 'Editó',
  delete: 'Eliminó',
}
const TABLE_LABELS: Record<string, string> = {
  documents: 'documento',
  document_versions: 'versión de documento',
  folders: 'carpeta',
  collections: 'colección',
  records: 'registro',
}

function AuditoriaPage() {
  const entries = Route.useLoaderData()

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h1 className="mb-6 text-xl font-display text-foreground">Auditoría</h1>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay actividad registrada.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="flex-1">
                <span className="font-medium text-foreground">
                  {entry.actor?.full_name ?? entry.actor?.email ?? 'Sistema'}
                </span>{' '}
                <span className="text-muted-foreground">
                  {ACTION_LABELS[entry.action] ?? entry.action}{' '}
                  {TABLE_LABELS[entry.table_name] ?? entry.table_name}
                </span>
                {entry.summary && (
                  <span className="text-foreground"> — {entry.summary}</span>
                )}
              </span>
              <span className="flex-none text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString('es-NI')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
