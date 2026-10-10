import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NorthStar } from '../../components/okr/NorthStar'
import { ObjectiveCard } from '../../components/okr/ObjectiveCard'
import type { OkrObjective } from '../../server/okr'

const noop = () => undefined

const objective: OkrObjective = {
  id: 'o1',
  title: 'Llegar a un ingreso mensual de 1.000.000',
  description: 'La meta del año',
  ownerId: 'p1',
  progress: 0.55,
  health: 'en_riesgo',
  keyResults: [
    {
      id: 'k1',
      title: 'Alcanzar 120 alumnos',
      kpiName: 'Nº de alumnos activos',
      unit: 'alumnos',
      startValue: 80,
      targetValue: 120,
      current: 102,
      source: 'manual',
      autoMetric: null,
      ownerId: null,
      dueOn: '2026-12-31',
      progress: 0.55,
      health: 'en_riesgo',
      checkins: [
        {
          id: 'c1',
          value: 102,
          note: 'Promoción de octubre',
          createdAt: '2026-10-05T10:00:00Z',
          author: 'Recepción',
        },
      ],
    },
    {
      id: 'k2',
      title: 'Aceptar 30 inscripciones',
      kpiName: '',
      unit: '',
      startValue: 0,
      targetValue: 30,
      current: 12,
      source: 'auto',
      autoMetric: 'documents.approved',
      ownerId: null,
      dueOn: null,
      progress: 0.4,
      health: 'en_ritmo',
      checkins: [],
    },
  ],
}

const card = (canRegister: boolean, canManage: boolean) =>
  renderToStaticMarkup(
    createElement(ObjectiveCard, {
      index: 1,
      objective,
      people: [{ id: 'p1', name: 'Steven' }],
      canRegister,
      canManage,
      onEdit: noop,
      onDelete: noop,
      onAddKeyResult: noop,
      onEditKeyResult: noop,
      onDeleteKeyResult: noop,
      onCheckin: noop,
    }),
  )

describe('pantalla de OKR', () => {
  it('muestra objetivo, resultados clave, cifras y semáforo', () => {
    const html = card(true, true)
    expect(html).toContain('Llegar a un ingreso mensual de 1.000.000')
    expect(html).toContain('102 alumnos de 120 alumnos')
    expect(html).toContain('55 %')
    expect(html).toContain('En riesgo')
    expect(html).toContain('Datos de Tools')
    expect(html).toContain('Steven')
  })

  it('recepción registra avances pero no edita; el automático no admite avance a mano', () => {
    const html = card(true, false)
    expect(html.match(/Registrar avance/g)).toHaveLength(1)
    expect(html).not.toContain('Editar resultado clave')
    expect(html).not.toContain('Eliminar objetivo')
    expect(html).not.toContain('Nuevo resultado')
  })

  it('un rol sin permisos no ve acciones', () => {
    const html = card(false, false)
    expect(html).not.toContain('Registrar avance')
    expect(html).not.toContain('Editar')
  })

  it('la estrella del norte muestra el mes, el porcentaje y 12 barras', () => {
    const income = Array.from({ length: 12 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, '0')}-01`,
      amount: i >= 6 ? 400000 + (i - 6) * 25000 : 0,
    }))
    const html = renderToStaticMarkup(
      createElement(NorthStar, {
        income,
        target: 1_000_000,
        unit: 'C$',
        canRegister: true,
        canManage: true,
        onRegister: noop,
        onEditTarget: noop,
      }),
    )
    expect(html).toContain('C$ 525.000')
    expect(html).toContain('1.000.000')
    expect(html).toContain('53 % de la meta')
    expect(html).toContain('Anotar ingresos')
    expect(html.match(/title="[a-z]{3} 2026:/g)).toHaveLength(12)
  })
})
