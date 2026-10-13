import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES, buildTemplateContent } from '../default-templates'
import { categoryOf, themeForTemplate } from '../template-catalog'
import { extractVariables } from '../template-variables'

const comite = DEFAULT_TEMPLATES.filter((t) =>
  buildTemplateContent(t).contentHtml.includes('SC-ARB-'),
)

describe('plantillas del comité arbitral', () => {
  it('hay seis, con su código SC-ARB-nnn en el cuadro de control', () => {
    expect(comite).toHaveLength(6)
    const codes = comite.map(
      (t) => /SC-ARB-\d{3}/.exec(buildTemplateContent(t).contentHtml)?.[0],
    )
    expect(codes).toEqual([
      'SC-ARB-001',
      'SC-ARB-002',
      'SC-ARB-003',
      'SC-ARB-004',
      'SC-ARB-005',
      'SC-ARB-006',
    ])
  })

  it('todas llevan el cuadro de control con área, versión y fecha', () => {
    for (const t of comite) {
      const html = buildTemplateContent(t).contentHtml
      expect(html).toContain('<th colspan="1" rowspan="1"><p>Código</p></th>')
      expect(html).toContain('<p>Comité arbitral</p>')
      expect(html).toContain('<p>1.0</p>')
      expect(html).toContain('{{fecha}}')
    }
  })

  it('ningún código del catálogo se repite', () => {
    const codes = DEFAULT_TEMPLATES.map(
      (t) =>
        /<td colspan="1" rowspan="1"><p>(SC-[A-Z]+-\d{3})<\/p><\/td>/.exec(
          buildTemplateContent(t).contentHtml,
        )?.[1],
    ).filter((c): c is string => c !== undefined)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('salen con el tema de eventos y en la categoría de eventos y ligas', () => {
    for (const t of comite) {
      expect(themeForTemplate(t.name)).toBe('event')
      expect(categoryOf(t.name)).toBe('eventos')
    }
  })

  it('son globales para que aparezcan en Ligas, Torneos y Academia', () => {
    for (const t of comite) expect(t.space).toBeNull()
  })

  it('piden al crearlas solo los datos propios (liga, jornada, división)', () => {
    const asked = new Set(
      comite.flatMap((t) =>
        extractVariables(buildTemplateContent(t).contentHtml),
      ),
    )
    expect([...asked].sort()).toEqual(['division', 'jornada', 'liga'])
  })

  it('el catálogo anterior no cambia de tema ni de categoría', () => {
    expect(themeForTemplate('Comunicado oficial')).toBe('corporate')
    expect(categoryOf('Comunicado oficial')).toBe('corporativo')
    expect(themeForTemplate('Acta de partido')).toBe('event')
    expect(themeForTemplate('Manual de uso')).toBe('report')
  })
})
