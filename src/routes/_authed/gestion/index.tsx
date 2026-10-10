import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  CalendarRange,
  CheckCircle2,
  Circle,
  Clock,
  Gauge,
  Lightbulb,
  LayoutDashboard,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import {
  budgetTotal,
  formatPercent,
  formatSignedPercent,
  formatValue,
  monthStart,
  roiFraction,
  roiProjection,
  shareOf,
} from '#/lib/okr'
import {
  Card,
  PageHeader,
  ProgressBar,
  StatTile,
  YearSelect,
} from '#/components/gestion/parts'
import { GESTION_SECTIONS, TINT_CLASSES } from '#/components/gestion/GestionNav'
import { useGestion } from '#/components/gestion/useGestion'
import { NorthStar } from '#/components/okr/NorthStar'
import { IncomeDialog, TargetDialog } from '#/components/okr/OkrDialogs'

export const Route = createFileRoute('/_authed/gestion/')({
  component: PanelPage,
})

const relative = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return new Date(iso).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
  })
}

function PanelPage() {
  const { data, user, canManage, canRegister, refresh, setYear } = useGestion()
  const { okr } = data
  const unit = okr.target.unit
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [targetOpen, setTargetOpen] = useState(false)

  const krs = okr.objectives.flatMap((o) => o.keyResults)
  const done = data.activities.filter((a) => a.status === 'completada').length
  const running = data.activities.filter(
    (a) => a.status === 'en_progreso',
  ).length
  const pending = data.activities.length - done - running
  const total = data.activities.length

  const investment = budgetTotal(data.budget)
  const roi = roiFraction(investment, roiProjection(data.roi)[0].total)
  const thisMonth = okr.income.at(-1)
  const name = user?.email.split('@')[0] ?? ''

  const status = [
    {
      icon: CheckCircle2,
      label: 'Tareas completadas',
      n: done,
      tone: 'text-success',
    },
    { icon: Clock, label: 'En progreso', n: running, tone: 'text-info' },
    {
      icon: Circle,
      label: 'Pendientes',
      n: pending,
      tone: 'text-muted-foreground',
    },
  ]

  const cards = [
    {
      to: '/gestion/okr',
      icon: Target,
      title: 'OKR',
      text: `${okr.objectives.length} ${okr.objectives.length === 1 ? 'objetivo' : 'objetivos'} y ${krs.length} resultados clave`,
    },
    {
      to: '/gestion/kpi',
      icon: Gauge,
      title: 'KPI',
      text: 'Indicadores derivados de los OKR',
    },
    {
      to: '/gestion/estrategias',
      icon: Lightbulb,
      title: 'Estrategias',
      text: `${data.strategies.length} ${data.strategies.length === 1 ? 'estrategia' : 'estrategias'} en ${data.year}`,
    },
    {
      to: '/gestion/plan',
      icon: CalendarRange,
      title: 'Plan de acción',
      text: 'Cronograma y actividades planificadas',
    },
    {
      to: '/gestion/presupuesto',
      icon: Wallet,
      title: 'Presupuesto',
      text: `Distribución de recursos: ${formatValue(investment, unit)}`,
    },
    {
      to: '/gestion/roi',
      icon: TrendingUp,
      title: 'ROI',
      text: 'Retorno de inversión estimado',
    },
  ] as const

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        tint="indigo"
        icon={LayoutDashboard}
        title={`Bienvenido, ${name}`}
        subtitle="Panel de control de Sport City: objetivos, estrategias y recursos en un solo lugar"
      >
        <YearSelect year={data.year} years={data.years} onChange={setYear} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Target}
          tint="blue"
          value={String(okr.objectives.length)}
          label="Objetivos activos"
        />
        <StatTile
          icon={Gauge}
          tint="emerald"
          value={String(krs.length)}
          label="KPI medidos"
        />
        <StatTile
          icon={Lightbulb}
          tint="amber"
          value={String(data.strategies.length)}
          label="Estrategias"
        />
        <StatTile
          icon={TrendingUp}
          tint="rose"
          value={roi === null ? '—' : formatSignedPercent(roi)}
          label="ROI estimado"
        />
      </div>

      <NorthStar
        income={okr.income}
        target={okr.target.amount}
        unit={unit}
        canRegister={canRegister}
        canManage={canManage}
        onRegister={() => setIncomeOpen(true)}
        onEditTarget={() => setTargetOpen(true)}
      />

      <Card className="p-5">
        <h2 className="font-display text-sm font-bold">
          Estado general del proyecto
        </h2>
        {total === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Aún no hay actividades. Cuando las añadas en el plan de acción,
            verás aquí cuántas están hechas.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {status.map((s) => (
              <li key={s.label}>
                <div className="flex items-center gap-2">
                  <s.icon className={`size-5 ${s.tone}`} />
                  <span className="flex-1 text-sm font-medium">{s.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.n} de {total}
                  </span>
                  <span className="w-10 text-right font-display text-sm font-bold">
                    {formatPercent(shareOf(s.n, total))}
                  </span>
                </div>
                <ProgressBar
                  value={shareOf(s.n, total)}
                  className="mt-1.5"
                  label={s.label}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.to} to={c.to}>
            <Card className="group h-full p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
              <span
                className={`flex size-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110 ${TINT_CLASSES[GESTION_SECTIONS.find((g) => g.to === c.to)?.tint ?? 'indigo']}`}
              >
                <c.icon className="size-5" />
              </span>
              <h3 className="mt-3 font-display text-base font-bold">
                {c.title}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{c.text}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="font-display text-sm font-bold">
          Actualizaciones recientes
        </h2>
        {data.updates.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Cuando registres avances o cambies el estado de una actividad,
            aparecerá aquí.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {data.updates.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {u.detail} · {relative(u.at)}
                  </div>
                </div>
                <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
                  {u.badge}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <IncomeDialog
        open={incomeOpen}
        month={thisMonth?.month ?? monthStart(new Date())}
        initialAmount={thisMonth?.amount ?? 0}
        initialNote={okr.incomeNote}
        unit={unit}
        onClose={() => setIncomeOpen(false)}
        onSaved={() => {
          setIncomeOpen(false)
          void refresh()
        }}
      />
      <TargetDialog
        open={targetOpen}
        current={okr.target.amount}
        unit={unit}
        onClose={() => setTargetOpen(false)}
        onSaved={() => {
          setTargetOpen(false)
          void refresh()
        }}
      />
    </div>
  )
}
