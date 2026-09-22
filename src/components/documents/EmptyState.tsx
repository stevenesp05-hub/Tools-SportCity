import type { LucideIcon } from 'lucide-react'
import { cn } from '#/lib/utils'

/**
 * Recuadro compacto para "aquí no hay nada todavía": icono + mensaje, con el mismo lenguaje visual
 * en toda la app (carriles del inicio, listas, el panel de avisos…). Para el vacío de una carpeta
 * completa, con botones de acción, usa `EmptyFolder` en su lugar.
 */
export function EmptyState({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-4 py-7 text-center',
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        <Icon className="size-4.5" />
      </span>
      <p className="max-w-xs text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
