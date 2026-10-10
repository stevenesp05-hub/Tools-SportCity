import { describe, expect, it } from 'vitest'
import {
  activitySchema,
  budgetByGroup,
  budgetTotal,
  checkinSchema,
  formatSignedPercent,
  incomeOfYear,
  kpiStatusOf,
  parseRoiConfig,
  roiFraction,
  roiProjection,
  shareOf,
  slotLabel,
  slotMonth,
  slotOf,
  slotOfDate,
  slotRangeLabel,
  slotWeek,
  strategyProgress,
  sumIncome,

  daysLeft,
  elapsedFraction,
  formatPercent,
  formatValue,
  healthOf,
  incomeSeries,
  keyResultSchema,
  krProgress,
  monthLabel,
  monthsToReach,
  parseNumberInput,
  objectiveProgress,
  periodLabel,
  periodOf,
  periodOptions,
  periodRange,
} from '../okr'

const day = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe('periodos', () => {
  it('calcula el trimestre y su rango', () => {
    expect(periodOf(day('2026-10-10'))).toBe('2026-T4')
    expect(periodOf(day('2026-03-31'))).toBe('2026-T1')
    expect(periodRange('2026-T4')).toEqual({
      start: '2026-10-01',
      end: '2026-12-31',
    })
    expect(periodRange('2026-T1').end).toBe('2026-03-31')
    expect(periodRange('2028-T1').end).toBe('2028-03-31')
    expect(periodRange('2026')).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })

  it('ofrece el año y los trimestres cercanos, pasando de año', () => {
    expect(periodOptions(day('2026-11-15'))).toEqual([
      '2026',
      '2026-T3',
      '2026-T4',
      '2027-T1',
      '2027-T2',
      '2027-T3',
    ])
  })

  it('etiqueta en español', () => {
    expect(periodLabel('2026-T4')).toBe('4.º trimestre de 2026')
    expect(periodLabel('2026')).toBe('Año 2026')
  })

  it('mide el tiempo transcurrido y los días que faltan', () => {
    expect(elapsedFraction('2026-T4', day('2026-09-01'))).toBe(0)
    expect(elapsedFraction('2026-T4', day('2027-02-01'))).toBe(1)
    const mid = elapsedFraction('2026-T4', day('2026-11-15'))
    expect(mid).toBeGreaterThan(0.45)
    expect(mid).toBeLessThan(0.55)
    expect(daysLeft('2026-T4', day('2026-12-21'))).toBe(10)
    expect(daysLeft('2026-T4', day('2027-01-10'))).toBe(0)
  })
})

describe('avance', () => {
  it('sube hacia la meta', () => {
    expect(krProgress({ start: 0, target: 100, current: 60 })).toBe(0.6)
    expect(krProgress({ start: 0, target: 100, current: 250 })).toBe(1)
    expect(krProgress({ start: 0, target: 100, current: -5 })).toBe(0)
  })

  it('también cuando hay que bajar', () => {
    expect(krProgress({ start: 20, target: 10, current: 15 })).toBe(0.5)
    expect(krProgress({ start: 20, target: 10, current: 25 })).toBe(0)
  })

  it('no divide entre cero', () => {
    expect(krProgress({ start: 5, target: 5, current: 5 })).toBe(1)
    expect(krProgress({ start: 5, target: 5, current: 4 })).toBe(0)
    expect(krProgress({ start: 0, target: 10, current: Number.NaN })).toBe(0)
  })

  it('el objetivo promedia sus resultados clave', () => {
    expect(objectiveProgress([])).toBe(0)
    expect(objectiveProgress([1, 0.5, 0])).toBe(0.5)
  })

  it('el semáforo compara avance con tiempo', () => {
    expect(healthOf(1, 0.2)).toBe('completado')
    expect(healthOf(0, 0)).toBe('en_ritmo')
    expect(healthOf(0.45, 0.5)).toBe('en_ritmo')
    expect(healthOf(0.3, 0.5)).toBe('en_riesgo')
    expect(healthOf(0.1, 0.5)).toBe('atrasado')
  })
})

describe('cifras', () => {
  it('formatea con la unidad en su sitio', () => {
    expect(formatValue(1000000, 'C$')).toBe('C$ 1.000.000')
    expect(formatValue(60, '%')).toBe('60 %')
    expect(formatValue(12.5, 'alumnos')).toBe('12,5 alumnos')
    expect(formatValue(1500, '')).toBe('1.500')
    expect(formatPercent(0.604)).toBe('60 %')
  })
})

describe('números escritos a mano', () => {
  it('entiende el formato español', () => {
    expect(parseNumberInput('1.000.000')).toBe(1000000)
    expect(parseNumberInput('1.500,5')).toBe(1500.5)
    expect(parseNumberInput('12,5')).toBe(12.5)
    expect(parseNumberInput(' 80 ')).toBe(80)
    expect(parseNumberInput('-3')).toBe(-3)
    expect(parseNumberInput('550000')).toBe(550000)
  })

  it('rechaza lo que no es un número', () => {
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('abc')).toBeNull()
    expect(parseNumberInput('12abc')).toBeNull()
    expect(parseNumberInput('1,2,3')).toBeNull()
  })
})

describe('ingresos', () => {
  const today = day('2026-10-10')

  it('rellena con 0 los meses sin dato y termina en el mes actual', () => {
    const series = incomeSeries(
      [
        { month: '2026-08-01', amount: 400000 },
        { month: '2026-10-01', amount: 550000 },
      ],
      today,
      4,
    )
    expect(series.map((p) => p.month)).toEqual([
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ])
    expect(series.map((p) => p.amount)).toEqual([0, 400000, 0, 550000])
  })

  it('cruza el cambio de año', () => {
    const series = incomeSeries([], day('2027-01-05'), 3)
    expect(series.map((p) => p.month)).toEqual([
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
    ])
    expect(monthLabel('2026-12-01')).toBe('dic 2026')
  })

  it('estima los meses que faltan al ritmo actual', () => {
    const series = [
      { month: '2026-07-01', amount: 400000 },
      { month: '2026-08-01', amount: 450000 },
      { month: '2026-09-01', amount: 500000 },
      { month: '2026-10-01', amount: 550000 },
    ]
    expect(monthsToReach(series, 1_000_000)).toBe(9)
    expect(monthsToReach(series, 500000)).toBe(0)
    expect(monthsToReach([{ month: '2026-10-01', amount: 100 }], 1000)).toBeNull()
    expect(monthsToReach([], 1000)).toBeNull()
    expect(
      monthsToReach(
        [
          { month: '2026-09-01', amount: 500 },
          { month: '2026-10-01', amount: 400 },
        ],
        1000,
      ),
    ).toBeNull()
  })
})

describe('validación', () => {
  const base = {
    objectiveId: 'o1',
    title: 'Llegar a 120 alumnos',
    kpiName: 'Nº de alumnos activos',
    unit: 'alumnos',
    startValue: 80,
    targetValue: 120,
    source: 'manual' as const,
    autoMetric: null,
    ownerId: null,
    dueOn: null,
  }

  it('acepta un resultado clave correcto', () => {
    expect(keyResultSchema.safeParse(base).success).toBe(true)
  })

  it('pide un dato de Tools si es automático', () => {
    expect(
      keyResultSchema.safeParse({ ...base, source: 'auto' }).success,
    ).toBe(false)
    expect(
      keyResultSchema.safeParse({
        ...base,
        source: 'auto',
        autoMetric: 'documents.approved',
      }).success,
    ).toBe(true)
  })

  it('rechaza meta igual al inicio y cifras no finitas', () => {
    expect(
      keyResultSchema.safeParse({ ...base, targetValue: 80 }).success,
    ).toBe(false)
    expect(
      checkinSchema.safeParse({ keyResultId: 'k', value: Infinity, note: '' })
        .success,
    ).toBe(false)
  })
})

describe('estado de un indicador', () => {
  it('pendiente, iniciado, en progreso y completado', () => {
    expect(kpiStatusOf(0)).toBe('pendiente')
    expect(kpiStatusOf(0.05)).toBe('iniciado')
    expect(kpiStatusOf(0.5)).toBe('en_progreso')
    expect(kpiStatusOf(0.99)).toBe('en_progreso')
    expect(kpiStatusOf(1)).toBe('completado')
  })
})

describe('plan de acción: casillas del año', () => {
  it('convierte entre casilla, mes y semana', () => {
    expect(slotOf(0, 1)).toBe(1)
    expect(slotOf(11, 4)).toBe(48)
    expect(slotMonth(1)).toBe(0)
    expect(slotMonth(48)).toBe(11)
    expect(slotWeek(5)).toBe(1)
    expect(slotWeek(8)).toBe(4)
    expect(slotLabel(10)).toBe('S2 de marzo')
  })

  it('sitúa una fecha en su semana', () => {
    expect(slotOfDate(day('2026-10-01'))).toBe(37)
    expect(slotOfDate(day('2026-10-07'))).toBe(37)
    expect(slotOfDate(day('2026-10-08'))).toBe(38)
    expect(slotOfDate(day('2026-10-31'))).toBe(40)
    expect(slotOfDate(day('2026-12-31'))).toBe(48)
  })

  it('describe un rango', () => {
    expect(slotRangeLabel(10, 10)).toBe('S2 de marzo')
    expect(slotRangeLabel(10, 13)).toBe('de S2 de marzo a S1 de abril')
  })

  it('valida que el final no sea antes del inicio', () => {
    const base = {
      year: 2026,
      strategyId: null,
      title: 'Campaña',
      ownerName: '',
      startSlot: 5,
      endSlot: 8,
      status: 'pendiente' as const,
      milestone: false,
      notes: '',
    }
    expect(activitySchema.safeParse(base).success).toBe(true)
    expect(activitySchema.safeParse({ ...base, endSlot: 4 }).success).toBe(false)
    expect(activitySchema.safeParse({ ...base, startSlot: 49 }).success).toBe(
      false,
    )
  })
})

describe('estrategias', () => {
  it('el avance sale de las actividades; sin ellas, del número manual', () => {
    expect(strategyProgress([], 35)).toBe(0.35)
    expect(strategyProgress([], 250)).toBe(1)
    expect(
      strategyProgress(
        [
          { status: 'completada' },
          { status: 'en_progreso' },
          { status: 'pendiente' },
          { status: 'pendiente' },
        ],
        99,
      ),
    ).toBe(0.375)
  })
})

describe('presupuesto', () => {
  const items = [
    { amount: 2500, spent: 1000, group: 'Desarrollo' },
    { amount: 3000, spent: 0, group: 'Marketing' },
    { amount: 900, spent: 900, group: ' Marketing ' },
    { amount: 100, spent: 0, group: '' },
  ]

  it('suma y reparte', () => {
    expect(budgetTotal(items)).toBe(6500)
    expect(shareOf(3250, 6500)).toBe(0.5)
    expect(shareOf(10, 0)).toBe(0)
  })

  it('agrupa de mayor a menor', () => {
    expect(budgetByGroup(items)).toEqual([
      { group: 'Marketing', amount: 3900, spent: 900 },
      { group: 'Desarrollo', amount: 2500, spent: 1000 },
      { group: 'Sin grupo', amount: 100, spent: 0 },
    ])
  })
})

describe('ROI', () => {
  it('calcula la proyección por año', () => {
    const rows = roiProjection({
      annualValue: 6000,
      projection: [
        { customers: 2, upsell: 3000 },
        { customers: 4, upsell: 9000 },
        { customers: 7, upsell: 18000 },
      ],
    })
    expect(rows.map((r) => r.total)).toEqual([15000, 33000, 60000])
    expect(rows[1]).toEqual({
      year: 2,
      customers: 4,
      base: 24000,
      upsell: 9000,
      total: 33000,
    })
  })

  it('el retorno es (ingresos − inversión) / inversión', () => {
    expect(roiFraction(13350, 15000)).toBeCloseTo(0.1236, 3)
    expect(roiFraction(1000, 500)).toBe(-0.5)
    expect(roiFraction(0, 500)).toBeNull()
    expect(formatSignedPercent(0.1236)).toBe('+12,4 %')
    expect(formatSignedPercent(-0.5)).toBe('-50 %')
  })

  it('una configuración rota vuelve a la vacía', () => {
    expect(parseRoiConfig({ annualValue: -1 })).toEqual({
      annualValue: 0,
      projection: [{ customers: 0, upsell: 0 }],
    })
    expect(parseRoiConfig(null).projection).toHaveLength(1)
  })
})

describe('ingresos de un año', () => {
  it('enero a diciembre con ceros y suma', () => {
    const year = incomeOfYear(
      [
        { month: '2026-01-01', amount: 100 },
        { month: '2026-10-01', amount: 250 },
        { month: '2025-12-01', amount: 999 },
      ],
      2026,
    )
    expect(year).toHaveLength(12)
    expect(year[0].amount).toBe(100)
    expect(year[9].amount).toBe(250)
    expect(sumIncome(year)).toBe(350)
  })
})
