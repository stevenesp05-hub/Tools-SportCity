import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChoiceSelect } from '#/components/ui/choice-select'
import { cn } from '#/lib/utils'
import { periodLabel } from '#/lib/okr'
import { TINT_CLASSES } from '#/components/gestion/GestionNav'
import type { Tint } from '#/components/gestion/GestionNav'

/** Cabecera de cada sección: icono, título, subtítulo y acciones a la derecha. */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  tint = 'indigo',
  children,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
  tint?: Tint
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          className={cn(
            'flex size-12 flex-none items-center justify-center rounded-2xl shadow-sm',
            TINT_CLASSES[tint],
          )}
        >
          <Icon className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold leading-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  )
}

export function YearSelect({
  year,
  years,
  onChange,
}: {
  year: number
  years: number[]
  onChange: (year: number) => void
}) {
  return (
    <ChoiceSelect
      value={String(year)}
      onChange={(v) => onChange(Number(v))}
      ariaLabel="Año"
      className="h-9 w-28 text-sm"
      options={years.map((y) => ({ value: String(y), label: String(y) }))}
    />
  )
}

export function PeriodSelect({
  period,
  periods,
  onChange,
}: {
  period: string
  periods: string[]
  onChange: (period: string) => void
}) {
  return (
    <ChoiceSelect
      value={period}
      onChange={onChange}
      ariaLabel="Periodo"
      className="h-9 w-52 text-sm"
      options={periods.map((p) => ({ value: p, label: periodLabel(p) }))}
    />
  )
}

/** Contador con icono de color. */
export function StatTile({
  icon: Icon,
  tint,
  value,
  label,
}: {
  icon: LucideIcon
  tint: Tint
  value: string
  label: string
}) {
  return (
    <div className="group rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110',
          TINT_CLASSES[tint],
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="mt-3 font-display text-3xl font-bold leading-none text-foreground">
        {value}
      </div>
      <div className="mt-1.5 text-sm text-muted-foreground">{label}</div>
    </div>
  )
}

export const Card = ({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) => (
  <section
    className={cn(
      'rounded-2xl border border-border bg-card shadow-[0_1px_2px_oklch(0.24_0.14_275/0.04)]',
      className,
    )}
  >
    {children}
  </section>
)

/** Barra de avance (0 a 1) con el color que se le pase. */
export function ProgressBar({
  value,
  className,
  barClassName = 'bg-primary',
  label,
}: {
  value: number
  className?: string
  barClassName?: string
  label?: string
}) {
  return (
    <div
      className={cn('h-2 overflow-hidden rounded-full bg-secondary', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500',
          barClassName,
        )}
        style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }}
      />
    </div>
  )
}

/**
 * Colores de las estrategias (posición 0 a 7). Las clases van escritas enteras para que Tailwind las
 * incluya.
 */
export const STRATEGY_COLORS = [
  { bar: 'bg-primary', soft: 'bg-primary/10 text-primary', dot: 'bg-primary' },
  { bar: 'bg-blue-500', soft: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  {
    bar: 'bg-amber-500',
    soft: 'bg-amber-100 text-amber-800',
    dot: 'bg-amber-500',
  },
  {
    bar: 'bg-emerald-500',
    soft: 'bg-emerald-100 text-emerald-800',
    dot: 'bg-emerald-500',
  },
  {
    bar: 'bg-violet-500',
    soft: 'bg-violet-100 text-violet-800',
    dot: 'bg-violet-500',
  },
  { bar: 'bg-rose-500', soft: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
  { bar: 'bg-teal-500', soft: 'bg-teal-100 text-teal-800', dot: 'bg-teal-500' },
  {
    bar: 'bg-slate-500',
    soft: 'bg-slate-200 text-slate-800',
    dot: 'bg-slate-500',
  },
] as const

export const colorOf = (index: number) =>
  STRATEGY_COLORS[Math.min(Math.max(index, 0), STRATEGY_COLORS.length - 1)]
