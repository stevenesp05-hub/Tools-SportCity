import { Link } from '@tanstack/react-router'
import { ArrowLeft, ChevronRight, Palette, Star } from 'lucide-react'
import { StatusBadge } from '#/components/documents/StatusBadge'
import { THEME_INFO } from '#/lib/doc-themes'
import type { DocTheme } from '#/lib/doc-themes'
import { initialsOf, timeAgo } from '#/lib/format'
import { cn } from '#/lib/utils'
import type { DocStatus } from '#/server/documents'

/**
 * Cabecera única del documento: identidad (carpeta, título, estado, tema), menús y herramientas
 * en una misma barra, como una aplicación de escritorio.
 */
export function DocumentHeader({
  folder,
  title,
  editing,
  onTitleChange,
  status,
  isFavorite,
  onToggleFavorite,
  canEdit,
  theme,
  version,
  author,
  updatedAt,
  editors,
  saveStatus,
  actions,
  menu,
  toolbar,
  focus = false,
  focusToggle,
}: {
  folder: { id: string; name: string }
  title: string
  editing: boolean
  onTitleChange: (title: string) => void
  status: DocStatus
  isFavorite: boolean
  onToggleFavorite: () => void
  canEdit: boolean
  theme: DocTheme
  version: number | null
  author: string | null
  updatedAt: string
  /** Nombres de las personas que están editando ahora mismo. */
  editors: string[]
  saveStatus: React.ReactNode
  actions: React.ReactNode
  menu: React.ReactNode
  toolbar: React.ReactNode
  /** Modo enfoque: cabecera mínima (título, guardado y salir). */
  focus?: boolean
  focusToggle?: React.ReactNode
}) {
  return (
    <header className="mb-2 flex-none rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 px-3 pt-2.5">
        <Link
          to="/documentos/$folderId"
          params={{ folderId: folder.id }}
          className="flex-none rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="Volver a la carpeta"
          aria-label="Volver a la carpeta"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'min-w-0 items-center gap-1.5 text-2xs text-muted-foreground',
              focus ? 'hidden' : 'flex',
            )}
          >
            <Link
              to="/documentos/$folderId"
              params={{ folderId: folder.id }}
              className="truncate font-medium hover:text-foreground hover:underline"
            >
              {folder.name}
            </Link>
            <ChevronRight className="size-3 flex-none opacity-60" />
            <StatusBadge status={status} className="flex-none" />
            <span
              className="hidden flex-none items-center gap-1 rounded-md border border-border px-1.5 py-0.5 md:inline-flex"
              title={`Tema: ${THEME_INFO[theme].description}`}
            >
              <Palette className="size-3" />
              {THEME_INFO[theme].label}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1">
            {editing ? (
              <input
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                aria-label="Título del documento"
                className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 font-display text-lg font-semibold text-foreground outline-none hover:bg-secondary/60 focus:border-ring focus:bg-background"
              />
            ) : (
              <h1 className="min-w-0 flex-1 truncate px-1.5 font-display text-lg font-semibold leading-8 text-foreground">
                {title}
              </h1>
            )}
            <button
              type="button"
              onClick={onToggleFavorite}
              className="flex-none rounded-md p-1.5 hover:bg-secondary"
              aria-label={
                isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'
              }
              title={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            >
              <Star
                className={cn(
                  'size-4',
                  isFavorite
                    ? 'fill-warning-solid text-warning-solid'
                    : 'text-muted-foreground',
                )}
              />
            </button>
          </div>
        </div>

        <div className="flex flex-none items-center gap-2">
          {editors.length > 0 && (
            <div
              className="hidden -space-x-1.5 sm:flex"
              title={`Editando ahora: ${editors.join(', ')}`}
            >
              {editors.slice(0, 3).map((name) => (
                <span
                  key={name}
                  className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-accent font-display text-2xs font-bold text-accent-foreground"
                >
                  {initialsOf(name)}
                </span>
              ))}
            </div>
          )}
          {saveStatus}
          {actions}
          {focusToggle}
        </div>
      </div>

      <div
        className={cn(
          'items-center justify-between gap-3 px-2 pb-1.5 pt-1',
          focus ? 'hidden' : 'flex',
        )}
      >
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
          {menu}
        </div>
        <div className="hidden flex-none text-2xs text-muted-foreground lg:block">
          {version !== null && <>Versión {version} · </>}
          {canEdit || author ? 'Editado' : 'Guardado'} {timeAgo(updatedAt)}
          {author && <> por {author}</>}
        </div>
      </div>

      {toolbar && <div className="border-t border-border">{toolbar}</div>}
    </header>
  )
}
