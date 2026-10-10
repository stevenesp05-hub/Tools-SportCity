import { useState } from 'react'
import {
  ChevronDown,
  Database,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import { formatPercent, formatValue } from '#/lib/okr'
import { HEALTH_TONE } from '#/components/okr/health'
import type { OkrKeyResult, OkrObjective, OkrPerson } from '#/server/okr'

const dateTime = (iso: string) =>
  new Date(iso).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

function Bar({ value, tone }: { value: number; tone: string }) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-secondary"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500',
          tone,
        )}
        style={{ width: `${value * 100}%` }}
      />
    </div>
  )
}

function KeyResultRow({
  n,
  kr,
  people,
  canRegister,
  canManage,
  onCheckin,
  onEdit,
  onDelete,
}: {
  n: number
  kr: OkrKeyResult
  people: OkrPerson[]
  canRegister: boolean
  canManage: boolean
  onCheckin: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const tone = HEALTH_TONE[kr.health]
  const owner = people.find((p) => p.id === kr.ownerId)?.name

  return (
    <li className="rounded-xl bg-secondary/50 px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <span className="mt-0.5 w-8 flex-none font-display text-2xs font-bold text-muted-foreground">
          KR{n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">{kr.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>
              {formatValue(kr.current, kr.unit)} de{' '}
              {formatValue(kr.targetValue, kr.unit)}
            </span>
            {owner && <span>· {owner}</span>}
            {kr.dueOn && <span>· hasta {dateTime(kr.dueOn)}</span>}
            {kr.source === 'auto' && (
              <span className="inline-flex items-center gap-1">
                · <Database className="size-3" /> Datos de Tools
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'rounded-md px-2 py-0.5 font-display text-2xs font-bold uppercase tracking-wide',
              tone.badge,
            )}
          >
            {tone.label}
          </span>
          <span className="w-11 text-right font-display text-sm font-bold text-foreground">
            {formatPercent(kr.progress)}
          </span>
        </div>
      </div>

      <div className="mt-2.5">
        <Bar value={kr.progress} tone={tone.bar} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {canRegister && kr.source === 'manual' && (
          <Button variant="outline" size="sm" onClick={onCheckin}>
            <TrendingUp className="size-4" />
            Registrar avance
          </Button>
        )}
        {kr.checkins.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            <ChevronDown
              className={cn(
                'size-4 transition-transform',
                open && 'rotate-180',
              )}
            />
            Historial ({kr.checkins.length})
          </Button>
        )}
        {canManage && (
          <span className="ml-auto flex gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Editar resultado clave"
              onClick={onEdit}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Eliminar resultado clave"
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          </span>
        )}
      </div>

      {open && (
        <ul className="mt-2 space-y-1.5 border-t border-border pt-2.5">
          {kr.checkins.map((c) => (
            <li key={c.id} className="flex flex-wrap gap-x-2 text-xs">
              <span className="font-medium text-foreground">
                {formatValue(c.value, kr.unit)}
              </span>
              <span className="text-muted-foreground">
                {dateTime(c.createdAt)}
                {c.author && ` · ${c.author}`}
              </span>
              {c.note && (
                <span className="w-full text-muted-foreground">{c.note}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function ObjectiveCard({
  index,
  objective,
  people,
  canRegister,
  canManage,
  onEdit,
  onDelete,
  onAddKeyResult,
  onEditKeyResult,
  onDeleteKeyResult,
  onCheckin,
}: {
  index: number
  objective: OkrObjective
  people: OkrPerson[]
  canRegister: boolean
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
  onAddKeyResult: () => void
  onEditKeyResult: (kr: OkrKeyResult) => void
  onDeleteKeyResult: (kr: OkrKeyResult) => void
  onCheckin: (kr: OkrKeyResult) => void
}) {
  const tone = HEALTH_TONE[objective.health]
  const owner = people.find((p) => p.id === objective.ownerId)?.name

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex flex-wrap items-start gap-3 bg-primary px-5 py-4 text-primary-foreground">
        <span className="flex size-9 flex-none items-center justify-center rounded-full bg-primary-foreground/15 font-display text-sm font-bold">
          O{index}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold leading-snug">
            {objective.title}
          </h2>
          {(objective.description || owner) && (
            <p className="mt-0.5 text-xs text-primary-foreground/75">
              {owner && `${owner}${objective.description ? ' · ' : ''}`}
              {objective.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-md px-2 py-0.5 font-display text-2xs font-bold uppercase tracking-wide',
              tone.badge,
            )}
          >
            {tone.label}
          </span>
          <span className="font-display text-lg font-bold">
            {formatPercent(objective.progress)}
          </span>
        </div>
      </header>

      <div className="space-y-2 p-4">
        {objective.keyResults.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">
            Todavía no hay resultados clave. Añade las cifras que dirán si este
            objetivo se cumple.
          </p>
        ) : (
          <ul className="space-y-2">
            {objective.keyResults.map((kr, i) => (
              <KeyResultRow
                key={kr.id}
                n={i + 1}
                kr={kr}
                people={people}
                canRegister={canRegister}
                canManage={canManage}
                onCheckin={() => onCheckin(kr)}
                onEdit={() => onEditKeyResult(kr)}
                onDelete={() => onDeleteKeyResult(kr)}
              />
            ))}
          </ul>
        )}
        {canManage && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onAddKeyResult}>
              <Plus className="size-4" />
              Resultado clave
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="size-4" />
              Editar objetivo
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="size-4" />
              Eliminar
            </Button>
          </div>
        )}
      </div>
    </article>
  )
}
