import { cn } from '#/lib/utils'
import type { DocStatus } from '#/server/documents'

export const STATUS_LABELS: Record<DocStatus, string> = {
  borrador: 'Borrador',
  aprobado: 'Aprobado',
  vigente: 'Vigente',
  vencido: 'Vencido',
}

const STATUS_STYLES: Record<DocStatus, string> = {
  borrador: 'bg-muted text-muted-foreground',
  aprobado: 'bg-[oklch(0.93_0.06_150)] text-[oklch(0.4_0.1_150)]',
  vigente: 'bg-[oklch(0.92_0.05_240)] text-[oklch(0.35_0.09_240)]',
  vencido: 'bg-[oklch(0.94_0.07_40)] text-[oklch(0.45_0.15_40)]',
}

export function StatusBadge({
  status,
  className,
}: {
  status: DocStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 font-display text-2xs font-bold uppercase tracking-wide',
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

export function isOverdue(dueDate: string | null) {
  return dueDate !== null && dueDate < new Date().toISOString().slice(0, 10)
}

export function formatDueDate(dueDate: string) {
  return new Date(`${dueDate}T00:00:00`).toLocaleDateString('es-NI', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
