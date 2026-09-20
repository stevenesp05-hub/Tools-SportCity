import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  TRASH_DAYS,
  listTrash,
  purgeDocument,
  restoreDocument,
} from '#/server/library'
import { hasPermission } from '#/lib/permissions'
import { Button } from '#/components/ui/button'
import { useDialogs } from '#/components/ui/dialogs'

export const Route = createFileRoute('/_authed/documentos/papelera')({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.user?.role, 'tools.documentos.editar')) {
      throw redirect({ to: '/documentos' })
    }
  },
  loader: () => listTrash(),
  component: PapeleraPage,
})

const daysLeft = (deletedAt: string) =>
  Math.max(
    0,
    Math.ceil(
      (new Date(deletedAt).getTime() + TRASH_DAYS * 86_400_000 - Date.now()) /
        86_400_000,
    ),
  )

function PapeleraPage() {
  const trashed = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const { confirm } = useDialogs()
  const canPurge = hasPermission(user?.role, 'tools.documentos.eliminar')

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      await router.invalidate()
      toast.success(success)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo completar la acción',
      )
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="mb-1 text-xl font-display text-foreground">Papelera</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Los documentos eliminados se conservan aquí {TRASH_DAYS} días y luego se
        borran definitivamente.
      </p>

      {trashed.length === 0 ? (
        <p className="text-sm text-muted-foreground">La papelera está vacía.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {trashed.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">
                  {doc.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {doc.folder_name ?? 'Sin carpeta'} · eliminado el{' '}
                  {new Date(doc.deleted_at).toLocaleDateString('es-NI')} · se
                  borra en {daysLeft(doc.deleted_at)}{' '}
                  {daysLeft(doc.deleted_at) === 1 ? 'día' : 'días'}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  run(
                    () => restoreDocument({ data: { id: doc.id } }),
                    'Documento restaurado',
                  )
                }
              >
                <RotateCcw className="size-4" />
                Restaurar
              </Button>
              {canPurge && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  title="Eliminar definitivamente"
                  aria-label="Eliminar definitivamente"
                  onClick={async () => {
                    const ok = await confirm({
                      title: '¿Eliminar definitivamente?',
                      description: `"${doc.title}" y todas sus versiones se borrarán y no se podrán recuperar.`,
                      confirmLabel: 'Eliminar definitivamente',
                      destructive: true,
                    })
                    if (ok)
                      await run(
                        () => purgeDocument({ data: { id: doc.id } }),
                        'Eliminado definitivamente',
                      )
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
