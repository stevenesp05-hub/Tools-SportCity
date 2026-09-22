import { Suspense, lazy, memo, useState } from 'react'
import { CalendarClock, Lock, Megaphone, Star, Tag, X } from 'lucide-react'
import { toast } from 'sonner'
import { ROLES, ROLE_LABELS } from '#/lib/permissions'
import type { Role } from '#/lib/permissions'
import { DOC_STATUSES } from '#/server/documents'
import type { DocStatus, DocumentDetail } from '#/server/documents'
import {
  setFeatured,
  toggleFavorite,
  updateDocumentAccess,
  updateDocumentMeta,
} from '#/server/library'
import {
  StatusBadge,
  STATUS_LABELS,
  isOverdue,
} from '#/components/documents/StatusBadge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Checkbox } from '#/components/ui/checkbox'
import { ChoiceSelect } from '#/components/ui/choice-select'
import { cn } from '#/lib/utils'

// El calendario (date-fns + react-day-picker) pesa bastante y solo hace falta al elegir la fecha.
const DatePicker = lazy(() =>
  import('#/components/ui/date-picker').then((m) => ({
    default: m.DatePicker,
  })),
)

function Field({
  label,
  icon,
  children,
}: {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 font-display text-2xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      {children}
    </div>
  )
}

export const DocumentMetaBar = memo(function DocumentMetaBar({
  document,
  onChange,
  onRefresh,
  canEdit,
  canApprove,
  canManageAccess,
}: {
  document: DocumentDetail
  /** Aplica el cambio en pantalla al instante (la página guarda el documento con los cambios locales). */
  onChange: (patch: Partial<DocumentDetail>) => void
  /** Vuelve a pedir el documento en segundo plano, para lo que solo conoce el servidor (quién aprobó). */
  onRefresh: () => void
  canEdit: boolean
  canApprove: boolean
  canManageAccess: boolean
}) {
  const [tagInput, setTagInput] = useState('')
  const [accessOpen, setAccessOpen] = useState(false)
  const [roles, setRoles] = useState<Role[] | null>(document.visible_roles)

  /** Muestra el cambio al instante; si el servidor lo rechaza, vuelve a lo anterior. */
  async function run(
    action: () => Promise<unknown>,
    patch: Partial<DocumentDetail>,
    refresh = false,
  ) {
    const previous = Object.fromEntries(
      Object.keys(patch).map((key) => [
        key,
        document[key as keyof DocumentDetail],
      ]),
    ) as Partial<DocumentDetail>
    onChange(patch)
    try {
      await action()
      if (refresh) onRefresh()
    } catch (err) {
      onChange(previous)
      toast.error(
        err instanceof Error ? err.message : 'No se pudo guardar el cambio',
      )
    }
  }

  function changeStatus(status: DocStatus) {
    // Igual que el servidor: aprobar o dejar vigente sella la fecha; volver a borrador la quita.
    const stamped = status === 'aprobado' || status === 'vigente'
    const patch: Partial<DocumentDetail> = { status }
    if (stamped) patch.approved_at = new Date().toISOString()
    else if (status === 'borrador') {
      patch.approved_at = null
      patch.approver = null
    }
    return run(
      () => updateDocumentMeta({ data: { id: document.id, status } }),
      patch,
      stamped,
    )
  }
  const changeDue = (value: string) =>
    run(
      () =>
        updateDocumentMeta({
          data: { id: document.id, dueDate: value || null },
        }),
      { due_date: value || null },
    )
  const setTags = (tags: string[]) =>
    run(() => updateDocumentMeta({ data: { id: document.id, tags } }), { tags })

  function addTag() {
    const tag = tagInput.trim()
    setTagInput('')
    if (tag && !document.tags.includes(tag))
      void setTags([...document.tags, tag])
  }

  function toggleRole(role: Role) {
    if (role === 'admin') return
    setRoles((prev) => {
      const base = prev ?? ROLES.slice()
      return base.includes(role)
        ? base.filter((r) => r !== role)
        : [...base, role]
    })
  }

  // Admin siempre lo ve: se guarda incluido para que la lista sea legible.
  const toWithAdmin = (list: Role[]): Role[] => [
    'admin',
    ...list.filter((r) => r !== 'admin'),
  ]

  const approver = document.approver?.full_name ?? document.approver?.email

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex flex-none items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-secondary"
          onClick={() =>
            run(
              () =>
                toggleFavorite({
                  data: {
                    documentId: document.id,
                    favorite: !document.is_favorite,
                  },
                }),
              { is_favorite: !document.is_favorite },
            )
          }
          aria-label={
            document.is_favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'
          }
        >
          <Star
            className={cn(
              'size-4',
              document.is_favorite
                ? 'fill-warning-solid text-warning-solid'
                : 'text-muted-foreground',
            )}
          />
          {document.is_favorite ? 'Favorito' : 'Añadir a favoritos'}
        </button>
      </div>

      <Field label="Estado">
        {canEdit ? (
          <ChoiceSelect<DocStatus>
            ariaLabel="Cambiar estado"
            className="w-full"
            value={document.status}
            onChange={(status) => void changeStatus(status)}
            options={DOC_STATUSES.map((s) => ({
              value: s,
              label: STATUS_LABELS[s],
              disabled: s !== 'borrador' && !canApprove,
            }))}
          />
        ) : (
          <StatusBadge status={document.status} />
        )}
        {document.approved_at && document.status !== 'borrador' && (
          <span className="text-xs text-muted-foreground">
            Aprobado{approver ? ` por ${approver}` : ''} el{' '}
            {new Date(document.approved_at).toLocaleDateString('es-NI')}
          </span>
        )}
      </Field>

      <Field label="Vence" icon={<CalendarClock className="size-3.5" />}>
        {canEdit ? (
          <Suspense
            fallback={
              <div className="h-8 w-32 rounded-md border border-border" />
            }
          >
            <DatePicker
              value={document.due_date}
              invalid={isOverdue(document.due_date)}
              onChange={(value) => void changeDue(value ?? '')}
            />
          </Suspense>
        ) : (
          <span className="text-sm text-foreground">
            {document.due_date ?? '—'}
          </span>
        )}
      </Field>

      <Field label="Etiquetas" icon={<Tag className="size-3.5" />}>
        <div className="flex flex-wrap items-center gap-1.5">
          {document.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
            >
              {tag}
              {canEdit && (
                <button
                  type="button"
                  onClick={() =>
                    setTags(document.tags.filter((t) => t !== tag))
                  }
                  aria-label={`Quitar ${tag}`}
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
        {canEdit && (
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder="Añadir etiqueta"
            className="h-8 w-full text-xs"
          />
        )}
      </Field>

      {canManageAccess && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start"
            onClick={() => setAccessOpen(true)}
          >
            <Lock
              className={cn('size-4', document.visible_roles && 'text-primary')}
            />
            Acceso
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start"
            title="Aparece en el inicio de todo el mundo, sin que cada persona lo marque como favorito."
            onClick={() =>
              run(
                () =>
                  setFeatured({
                    data: { id: document.id, featured: !document.featured },
                  }),
                { featured: !document.featured },
              )
            }
          >
            <Megaphone
              className={cn('size-4', document.featured && 'text-primary')}
            />
            {document.featured ? 'Destacado para todos' : 'Destacar para todos'}
          </Button>
          <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>¿Quién puede ver este documento?</DialogTitle>
              </DialogHeader>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {ROLES.map((role) => (
                  <label
                    key={role}
                    className="flex items-center gap-1.5 text-sm text-foreground"
                  >
                    <Checkbox
                      checked={
                        role === 'admin' ||
                        roles === null ||
                        roles.includes(role)
                      }
                      disabled={role === 'admin'}
                      onCheckedChange={() => toggleRole(role)}
                    />
                    {ROLE_LABELS[role]}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Se suma a la visibilidad de la carpeta: hay que poder ver ambas.
                Con todos marcados, lo ve quien vea la carpeta. Administración
                siempre lo ve.
              </p>
              <DialogFooter>
                <Button
                  onClick={async () => {
                    const all =
                      roles === null || ROLES.every((r) => roles.includes(r))
                    await run(
                      () =>
                        updateDocumentAccess({
                          data: {
                            id: document.id,
                            visibleRoles: all ? null : toWithAdmin(roles),
                          },
                        }),
                      { visible_roles: all ? null : toWithAdmin(roles) },
                    )
                    setAccessOpen(false)
                  }}
                >
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
})
