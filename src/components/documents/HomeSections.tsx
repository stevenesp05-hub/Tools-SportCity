import { Link } from '@tanstack/react-router'
import {
  AlarmClock,
  CalendarClock,
  ClipboardCheck,
  Clock,
  Megaphone,
  Star,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DocThumbnail } from '#/components/documents/DocThumbnail'
import { EmptyState } from '#/components/documents/EmptyState'
import {
  StatusBadge,
  formatDueDate,
  isOverdue,
} from '#/components/documents/StatusBadge'
import { timeAgo } from '#/lib/format'
import { cn } from '#/lib/utils'
import type { HomeDocument } from '#/server/library'

/** Cifra de un vistazo: número grande, etiqueta y un tono de color (los mismos que los avisos del sistema). */
function StatTile({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: LucideIcon
  value: number
  label: string
  tone: 'info' | 'warning' | 'success' | 'neutral'
}) {
  const TONE_CLASS: Record<typeof tone, string> = {
    info: 'bg-info-soft text-info',
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
    neutral: 'bg-secondary text-primary',
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
      <span
        className={cn(
          'flex size-10 flex-none items-center justify-center rounded-lg',
          TONE_CLASS[tone],
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-2xl leading-none text-foreground">
          {value.toLocaleString('es-NI')}
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {label}
        </span>
      </span>
    </div>
  )
}

function MiniCard({ doc }: { doc: HomeDocument }) {
  return (
    <Link
      to="/documentos/doc/$docId"
      params={{ docId: doc.id }}
      className="group flex w-44 flex-none flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg sm:w-48"
    >
      <div className="border-b border-border bg-[var(--doc-desk)] p-2.5">
        <DocThumbnail
          id={doc.id}
          title={doc.title}
          className="rounded-sm shadow-sm ring-1 ring-black/5"
        />
      </div>
      <div className="space-y-1 p-2.5">
        <div className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {doc.title}
        </div>
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={doc.status} />
          <span className="truncate text-2xs text-muted-foreground">
            {timeAgo(doc.updated_at)}
          </span>
        </div>
      </div>
    </Link>
  )
}

function Rail({
  title,
  icon: Icon,
  documents,
  empty,
}: {
  title: string
  icon: LucideIcon
  documents: HomeDocument[]
  empty: string
}) {
  return (
    <section className="min-w-0">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-display uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </h2>
      {documents.length === 0 ? (
        <EmptyState icon={Icon}>{empty}</EmptyState>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {documents.map((doc) => (
            <MiniCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </section>
  )
}

function DueList({ documents }: { documents: HomeDocument[] }) {
  return (
    <section className="min-w-0">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-display uppercase tracking-wide text-muted-foreground">
        <CalendarClock className="size-3.5" />
        Próximos vencimientos
      </h2>
      {documents.length === 0 ? (
        <EmptyState icon={CalendarClock}>
          Nada por vencer en los próximos 30 días.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                to="/documentos/doc/$docId"
                params={{ docId: doc.id }}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-secondary/60"
              >
                <span
                  className={cn(
                    'flex size-7 flex-none items-center justify-center rounded-lg',
                    doc.due_date && isOverdue(doc.due_date)
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-warning-soft text-warning',
                  )}
                >
                  <CalendarClock className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {doc.title}
                </span>
                {doc.due_date && (
                  <span
                    className={cn(
                      'flex-none text-xs',
                      isOverdue(doc.due_date)
                        ? 'font-medium text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {isOverdue(doc.due_date) ? 'Venció ' : 'Vence '}
                    {formatDueDate(doc.due_date)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function HomeSections({
  userName,
  featured,
  favorites,
  recents,
  due,
  pendingReviews,
}: {
  userName: string
  /** Destacados por un administrador para todo el mundo (no depende de los favoritos de cada persona). */
  featured: HomeDocument[]
  favorites: HomeDocument[]
  recents: HomeDocument[]
  due: HomeDocument[]
  /** Revisiones pendientes asignadas a mí. */
  pendingReviews: number
}) {
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const overdueCount = due.filter((d) => isOverdue(d.due_date)).length
  return (
    <div className="mb-8 space-y-7">
      <div>
        <h1 className="text-2xl font-display text-foreground">
          {greeting}, {userName}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Sigue donde lo dejaste o entra en un espacio.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={ClipboardCheck}
          value={pendingReviews}
          label="Por revisar"
          tone="info"
        />
        <StatTile
          icon={AlarmClock}
          value={overdueCount}
          label="Vencidos"
          tone="warning"
        />
        <StatTile
          icon={Star}
          value={favorites.length}
          label="Favoritos"
          tone="success"
        />
        <StatTile
          icon={Megaphone}
          value={featured.length}
          label="Destacados"
          tone="neutral"
        />
      </div>
      {featured.length > 0 && (
        <Rail
          title="Destacados"
          icon={Megaphone}
          documents={featured}
          empty=""
        />
      )}
      <Rail
        title="Recientes"
        icon={Clock}
        documents={recents}
        empty="Aún no has abierto documentos. Entra en un espacio para empezar."
      />
      <div className="grid gap-7 lg:grid-cols-2">
        <Rail
          title="Favoritos"
          icon={Star}
          documents={favorites}
          empty="Marca documentos con la estrella para tenerlos aquí."
        />
        <DueList documents={due} />
      </div>
      <h2 className="-mb-3 text-xs font-display uppercase tracking-wide text-muted-foreground">
        Espacios
      </h2>
    </div>
  )
}
