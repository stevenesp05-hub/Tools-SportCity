import { Star } from 'lucide-react'
import { initialsOf } from '#/lib/format'
import { nameCaseError } from '#/lib/name-rules'
import { cn } from '#/lib/utils'

/**
 * Cabecera única del documento: identidad (título, favorito), menús y herramientas en una misma
 * barra, como una aplicación de escritorio. El título es lo primero que se ve, sin nada encima —
 * la carpeta y el estado se consultan desde «Ver → Detalles del documento», no están siempre a la
 * vista.
 */
export function DocumentHeader({
  originalTitle,
  title,
  editing,
  onTitleChange,
  isFavorite,
  onToggleFavorite,
  editors,
  saveStatus,
  actions,
  menu,
  toolbar,
}: {
  /** Título guardado: un documento anterior a la regla de nombres puede conservar el suyo. */
  originalTitle: string
  title: string
  editing: boolean
  onTitleChange: (title: string) => void
  isFavorite: boolean
  onToggleFavorite: () => void
  /** Nombres de las personas que están editando ahora mismo. */
  editors: string[]
  saveStatus: React.ReactNode
  actions: React.ReactNode
  menu: React.ReactNode
  toolbar: React.ReactNode
}) {
  // Solo se avisa si el título se ha cambiado: el de siempre de un documento antiguo no molesta.
  const titleError = title !== originalTitle ? nameCaseError(title) : null
  return (
    <header className="mb-3 flex-none border-b border-border bg-card">
      <div className="flex items-center gap-3 px-3 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            {editing ? (
              <input
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                aria-label="Título del documento"
                aria-invalid={titleError !== null}
                className={cn(
                  'h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 font-display text-lg font-semibold text-foreground outline-none hover:bg-secondary/60 focus:border-ring focus:bg-background',
                  titleError && 'border-destructive',
                )}
              />
            ) : (
              <h1 className="min-w-0 truncate px-1.5 font-display text-lg font-semibold leading-8 text-foreground">
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
          {editing && titleError && (
            <p className="px-1.5 pb-1 text-xs text-destructive">{titleError}</p>
          )}
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
        </div>
      </div>

      <div className="px-2 pb-1.5 pt-1 [scrollbar-width:none] overflow-x-auto">
        {menu}
      </div>

      {toolbar && <div className="border-t border-border">{toolbar}</div>}
    </header>
  )
}
