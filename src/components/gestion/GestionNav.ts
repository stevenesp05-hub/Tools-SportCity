import {
  CalendarRange,
  Gauge,
  LayoutDashboard,
  Lightbulb,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Los iconos van en una ficha discreta del azul de la marca. Se conserva el nombre de color por si
 * algún día se quiere distinguir una sección; hoy todos comparten el mismo tono.
 */
const NEUTRAL = 'bg-primary/[0.08] text-primary'

export type Tint =
  'indigo' | 'blue' | 'emerald' | 'amber' | 'violet' | 'teal' | 'rose' | 'slate'

export const TINT_CLASSES: Record<Tint, string> = {
  indigo: NEUTRAL,
  blue: NEUTRAL,
  emerald: NEUTRAL,
  amber: NEUTRAL,
  violet: NEUTRAL,
  teal: NEUTRAL,
  rose: NEUTRAL,
  slate: NEUTRAL,
}

/** Acento fuerte de cada color (barras, bordes, degradados). */
export const TINT_ACCENT: Record<Tint, string> = {
  indigo: 'from-indigo-500 to-indigo-700',
  blue: 'from-blue-500 to-blue-700',
  emerald: 'from-emerald-500 to-emerald-700',
  amber: 'from-amber-400 to-amber-600',
  violet: 'from-violet-500 to-violet-700',
  teal: 'from-teal-500 to-teal-700',
  rose: 'from-rose-500 to-rose-700',
  slate: 'from-slate-500 to-slate-700',
}

export type GestionSection = {
  to:
    | '/gestion'
    | '/gestion/okr'
    | '/gestion/kpi'
    | '/gestion/estrategias'
    | '/gestion/plan'
    | '/gestion/presupuesto'
    | '/gestion/roi'
  label: string
  icon: LucideIcon
  tint: Tint
}

/** Secciones de la gestión estratégica, en el orden del menú. */
export const GESTION_SECTIONS: GestionSection[] = [
  { to: '/gestion', label: 'Panel', icon: LayoutDashboard, tint: 'indigo' },
  { to: '/gestion/okr', label: 'OKR', icon: Target, tint: 'blue' },
  { to: '/gestion/kpi', label: 'KPI', icon: Gauge, tint: 'emerald' },
  {
    to: '/gestion/estrategias',
    label: 'Estrategias',
    icon: Lightbulb,
    tint: 'amber',
  },
  {
    to: '/gestion/plan',
    label: 'Plan de acción',
    icon: CalendarRange,
    tint: 'violet',
  },
  {
    to: '/gestion/presupuesto',
    label: 'Presupuesto',
    icon: Wallet,
    tint: 'teal',
  },
  { to: '/gestion/roi', label: 'ROI', icon: TrendingUp, tint: 'rose' },
]
