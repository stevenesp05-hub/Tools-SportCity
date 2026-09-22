import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
  ArrowDown,
  CalendarClock,
  Eye,
  FileText,
  Lock,
  Megaphone,
  Pencil,
  Star,
} from 'lucide-react'
import { DocThumbnail } from '#/components/documents/DocThumbnail'
import {
  StatusBadge,
  formatDueDate,
  isOverdue,
} from '#/components/documents/StatusBadge'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { initialsOf, timeAgo } from '#/lib/format'
import { cn } from '#/lib/utils'
import type { DocStatus, DocumentSummary } from '#/server/documents'

const STATUS_ICON: Record<DocStatus, string> = {
  borrador: 'bg-muted text-muted-foreground',
  aprobado: 'bg-[oklch(0.93_0.06_150)] text-[oklch(0.4_0.1_150)]',
  vigente: 'bg-[oklch(0.92_0.05_240)] text-[oklch(0.35_0.09_240)]',
  vencido: 'bg-[oklch(0.94_0.07_40)] text-[oklch(0.45_0.15_40)]',
}

type Shared = {
  docs: DocumentSummary[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleFav: (doc: DocumentSummary) => void
  onQuickLook: (doc: DocumentSummary) => void
  renderMenu: (doc: DocumentSummary) => ReactNode
  canEdit: boolean
}

function Avatar({
  name,
  className,
}: {
  name: string | null
  className?: string
}) {
  return (
    <span
      title={name ?? undefined}
      className={cn(
        'flex size-5 flex-none items-center justify-center rounded-full bg-primary/10 font-display text-[8px] font-bold text-primary',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  )
}

export function DocumentGrid({
  docs,
  selected,
  onToggleSelect,
  onToggleFav,
  onQuickLook,
  renderMenu,
}: Shared) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {docs.map((doc) => {
        const isSelected = selected.has(doc.id)
        return (
          <div
            key={doc.id}
            className={cn(
              'group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
              isSelected
                ? 'border-primary ring-2 ring-primary/30'
                : 'border-border hover:border-primary/40',
            )}
          >
            <Link
              to="/documentos/doc/$docId"
              params={{ docId: doc.id }}
              className="block border-b border-border bg-[var(--doc-desk)] p-3"
              aria-label={`Abrir ${doc.title}`}
            >
              <DocThumbnail
                id={doc.id}
                title={doc.title}
                className="rounded-sm shadow-sm ring-1 ring-black/5"
              />
            </Link>

            <div className="absolute left-3 top-3 z-10">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(doc.id)}
                aria-label={`Seleccionar ${doc.title}`}
                className={cn(
                  'bg-card shadow-sm transition-opacity',
                  isSelected
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100',
                )}
              />
            </div>
            <div className="absolute right-3 top-3 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => onQuickLook(doc)}
                title="Vista rápida"
                aria-label="Vista rápida"
                className="flex size-7 items-center justify-center rounded-full bg-card shadow-sm hover:bg-secondary"
              >
                <Eye className="size-3.5" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-1.5 p-3">
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-0.5 flex size-6 flex-none items-center justify-center rounded-md',
                    STATUS_ICON[doc.status],
                  )}
                >
                  <FileText className="size-3.5" />
                </span>
                <Link
                  to="/documentos/doc/$docId"
                  params={{ docId: doc.id }}
                  className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug text-foreground hover:underline"
                >
                  {doc.title}
                </Link>
                <div className="-mr-1 flex flex-none items-center">
                  <button
                    type="button"
                    onClick={() => onToggleFav(doc)}
                    className="p-1"
                    aria-label={
                      doc.is_favorite
                        ? 'Quitar de favoritos'
                        : 'Añadir a favoritos'
                    }
                  >
                    <Star
                      className={cn(
                        'size-3.5',
                        doc.is_favorite
                          ? 'fill-warning-solid text-warning-solid'
                          : 'text-muted-foreground/40 hover:text-warning-solid',
                      )}
                    />
                  </button>
                  {renderMenu(doc)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
                <StatusBadge status={doc.status} />
                {doc.visible_roles && <Lock className="size-3" />}
                {doc.featured && (
                  <Megaphone
                    className="size-3 text-primary"
                    aria-label="Destacado para todos"
                  />
                )}
                {doc.due_date && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      isOverdue(doc.due_date) && 'font-medium text-destructive',
                    )}
                  >
                    <CalendarClock className="size-3" />
                    {formatDueDate(doc.due_date)}
                  </span>
                )}
              </div>
              <div className="mt-auto flex items-center gap-1.5 pt-1 text-2xs text-muted-foreground">
                <Avatar name={doc.author} className="size-4 text-[7px]" />
                <span className="truncate">
                  {timeAgo(doc.updated_at)}
                  {doc.author ? ` · ${doc.author}` : ''}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function DocumentList({
  docs,
  selected,
  onToggleSelect,
  onToggleFav,
  onQuickLook,
  renderMenu,
  canEdit,
  sort,
  onSort,
}: Shared & {
  sort: 'name' | 'date'
  onSort: (sort: 'name' | 'date') => void
}) {
  const head = (label: string, key: 'name' | 'date' | null, className = '') => (
    <button
      type="button"
      disabled={key === null}
      onClick={() => key && onSort(key)}
      className={cn(
        'flex items-center gap-1 text-left text-2xs font-display uppercase tracking-wide text-muted-foreground',
        key && 'hover:text-foreground',
        className,
      )}
    >
      {label}
      {key && sort === key && <ArrowDown className="size-3" />}
    </button>
  )

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="hidden items-center gap-3 border-b border-border bg-secondary/40 px-4 py-2 md:flex">
        <span className="w-4 flex-none" />
        <span className="w-6 flex-none" />
        {head('Nombre', 'name', 'flex-1')}
        {head('Estado', null, 'w-24')}
        {head('Modificado por', null, 'w-40')}
        {head('Modificado', 'date', 'w-28')}
        <span className="w-24 flex-none" />
      </div>
      <ul className="divide-y divide-border">
        {docs.map((doc) => {
          const isSelected = selected.has(doc.id)
          return (
            <li
              key={doc.id}
              className={cn(
                'group flex items-center gap-3 px-4 transition-colors hover:bg-secondary/60',
                isSelected && 'bg-secondary',
              )}
            >
              <Checkbox
                className="flex-none"
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(doc.id)}
                aria-label={`Seleccionar ${doc.title}`}
              />
              <Link
                to="/documentos/doc/$docId"
                params={{ docId: doc.id }}
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5"
              >
                <span
                  className={cn(
                    'flex size-6 flex-none items-center justify-center rounded-md',
                    STATUS_ICON[doc.status],
                  )}
                >
                  <FileText className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {doc.title}
                  </span>
                  {(doc.tags.length > 0 || doc.due_date) && (
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      {doc.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-secondary px-1.5 py-0.5 text-2xs text-secondary-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                      {doc.due_date && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-2xs',
                            isOverdue(doc.due_date)
                              ? 'font-medium text-destructive'
                              : 'text-muted-foreground',
                          )}
                        >
                          <CalendarClock className="size-3" />
                          {formatDueDate(doc.due_date)}
                        </span>
                      )}
                    </span>
                  )}
                </span>
                {doc.visible_roles && (
                  <Lock className="size-3 flex-none text-muted-foreground" />
                )}
                {doc.featured && (
                  <Megaphone
                    className="size-3 flex-none text-primary"
                    aria-label="Destacado para todos"
                  />
                )}
                <span className="hidden w-24 flex-none md:block">
                  <StatusBadge status={doc.status} />
                </span>
                <span className="hidden w-40 flex-none items-center gap-2 text-xs text-muted-foreground md:flex">
                  <Avatar name={doc.author} />
                  <span className="truncate">{doc.author ?? '—'}</span>
                </span>
                <span
                  className="hidden w-28 flex-none text-xs text-muted-foreground md:block"
                  title={new Date(doc.updated_at).toLocaleString('es-NI')}
                >
                  {timeAgo(doc.updated_at)}
                </span>
              </Link>
              <div className="flex w-24 flex-none items-center justify-end gap-0.5">
                <button
                  type="button"
                  onClick={() => onToggleFav(doc)}
                  className="p-1"
                  aria-label={
                    doc.is_favorite
                      ? 'Quitar de favoritos'
                      : 'Añadir a favoritos'
                  }
                >
                  <Star
                    className={cn(
                      'size-4',
                      doc.is_favorite
                        ? 'fill-warning-solid text-warning-solid'
                        : 'text-muted-foreground/40 hover:text-warning-solid',
                    )}
                  />
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-0 group-hover:opacity-100"
                  onClick={() => onQuickLook(doc)}
                  title="Vista rápida"
                  aria-label="Vista rápida"
                >
                  <Eye className="size-4" />
                </Button>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hidden size-7 opacity-0 group-hover:opacity-100 lg:inline-flex"
                    asChild
                  >
                    <Link
                      to="/documentos/doc/$docId"
                      params={{ docId: doc.id }}
                      search={{ editar: true }}
                      title="Editar"
                      aria-label="Editar"
                    >
                      <Pencil className="size-4" />
                    </Link>
                  </Button>
                )}
                {renderMenu(doc)}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
