import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowUp,
  Pencil,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import {
  budgetTotal,
  formatPercent,
  formatSignedPercent,
  formatValue,
  roiFraction,
  roiProjection,
  sumIncome,
} from '#/lib/okr'
import { Button } from '#/components/ui/button'
import {
  Card,
  PageHeader,
  ProgressBar,
  StatTile,
  YearSelect,
} from '#/components/gestion/parts'
import { useGestion } from '#/components/gestion/useGestion'
import { RoiDialog } from '#/components/gestion/BudgetDialogs'

export const Route = createFileRoute('/_authed/gestion/roi')({
  component: RoiPage,
})

function RoiPage() {
  const { data, canManage, refresh, setYear } = useGestion()
  const unit = data.okr.target.unit
  const [open, setOpen] = useState(false)

  const investment = budgetTotal(data.budget)
  const rows = roiProjection(data.roi)
  const first = rows[0]
  const roi = roiFraction(investment, first.total)
  const realIncome = sumIncome(data.incomeYear)
  const yearGoal = data.okr.target.amount * 12
  const realRoi = roiFraction(investment, realIncome)
  const configured = data.roi.annualValue > 0 || first.upsell > 0

  const conclusion = (() => {
    if (investment <= 0)
      return 'Todavía no hay presupuesto este año, así que no se puede calcular el retorno. Añade las partidas en la sección Presupuesto.'
    if (!configured)
      return 'Configura los parámetros (clientes y valor por cliente) para ver la proyección y la conclusión.'
    const tail =
      rows.length > 1
        ? ` En el año ${rows.length}, con ${rows[rows.length - 1].customers} clientes, los ingresos llegarían a ${formatValue(rows[rows.length - 1].total, unit)}.`
        : ''
    return `Con una inversión de ${formatValue(investment, unit)} y una expectativa de ${first.customers} ${first.customers === 1 ? 'cliente' : 'clientes'} el primer año, los ingresos previstos son ${formatValue(first.total, unit)}, un retorno ${roi !== null && roi >= 0 ? 'positivo' : 'negativo'} de ${roi === null ? '—' : formatSignedPercent(roi)}.${tail}`
  })()

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        tint="rose"
        icon={TrendingUp}
        title="ROI estimado"
        subtitle={`Retorno de inversión proyectado · ${data.year}`}
      >
        <YearSelect year={data.year} years={data.years} onChange={setYear} />
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Pencil className="size-4" />
            Parámetros
          </Button>
        )}
      </PageHeader>

      <section className="grid gap-5 rounded-2xl bg-primary px-6 py-7 text-center text-primary-foreground sm:grid-cols-3">
        <div>
          <div className="text-sm text-primary-foreground/70">Inversión</div>
          <div className="mt-1 font-display text-3xl font-bold">
            {formatValue(investment, unit)}
          </div>
        </div>
        <div>
          <div className="text-sm text-primary-foreground/70">
            Ingresos previstos
          </div>
          <div className="mt-1 font-display text-3xl font-bold">
            {formatValue(first.total, unit)}
          </div>
        </div>
        <div>
          <div className="text-sm text-primary-foreground/70">ROI anual</div>
          <div className="mt-1 font-display text-3xl font-bold">
            {roi === null ? '—' : formatSignedPercent(roi)}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={Wallet}
          tint="teal"
          value={formatValue(investment, unit)}
          label="Inversión total"
        />
        <StatTile
          icon={Users}
          tint="blue"
          value={String(first.customers)}
          label="Clientes objetivo"
        />
        <StatTile
          icon={Target}
          tint="emerald"
          value={formatValue(data.roi.annualValue, unit)}
          label="Valor medio anual"
        />
        <StatTile
          icon={ArrowUp}
          tint="amber"
          value={formatValue(first.upsell, unit)}
          label="Venta adicional estimada"
        />
      </div>

      <Card className="p-5">
        <h2 className="font-display text-sm font-bold">Cálculo del ROI</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              {first.customers} {first.customers === 1 ? 'cliente' : 'clientes'}{' '}
              × {formatValue(data.roi.annualValue, unit)}
            </dt>
            <dd className="font-medium">{formatValue(first.base, unit)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Venta adicional estimada</dt>
            <dd className="font-medium">{formatValue(first.upsell, unit)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-border pt-2">
            <dt className="font-medium">Total ingresos año 1</dt>
            <dd className="font-display font-bold">
              {formatValue(first.total, unit)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="border-b border-border px-5 py-4 font-display text-sm font-bold">
          Proyección a {rows.length} {rows.length === 1 ? 'año' : 'años'}
        </h2>
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-5 py-2 font-medium">Periodo</th>
              <th className="px-3 py-2 text-right font-medium">Clientes</th>
              <th className="px-3 py-2 text-right font-medium">
                Ingresos base
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Venta adicional
              </th>
              <th className="px-5 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} className="border-t border-border">
                <td className="px-5 py-2.5">Año {r.year}</td>
                <td className="px-3 py-2.5 text-right">{r.customers}</td>
                <td className="px-3 py-2.5 text-right">
                  {formatValue(r.base, unit)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {formatValue(r.upsell, unit)}
                </td>
                <td className="px-5 py-2.5 text-right font-medium">
                  {formatValue(r.total, unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-sm font-bold">
          Lo que llevas de {data.year}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Ingresos reales anotados frente a la meta anual (la meta mensual ×
          12).
        </p>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-display text-2xl font-bold">
            {formatValue(realIncome, unit)}
          </span>
          <span className="text-sm text-muted-foreground">
            de {formatValue(yearGoal, unit)}
          </span>
        </div>
        <ProgressBar
          value={yearGoal > 0 ? realIncome / yearGoal : 0}
          className="mt-2"
          label="Ingresos del año frente a la meta anual"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {formatPercent(yearGoal > 0 ? Math.min(1, realIncome / yearGoal) : 0)}{' '}
          de la meta anual
          {realRoi !== null &&
            ` · retorno real sobre la inversión: ${formatSignedPercent(realRoi)}`}
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-sm font-bold">Conclusión</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {conclusion}
        </p>
      </Card>

      <RoiDialog
        open={open}
        year={data.year}
        config={data.roi}
        unit={unit}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false)
          void refresh()
        }}
      />
    </div>
  )
}
