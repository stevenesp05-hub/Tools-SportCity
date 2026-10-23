import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES, buildTemplateContent } from '../default-templates'
import { themeForTemplate } from '../template-catalog'

const empresas = DEFAULT_TEMPLATES.filter((t) => t.space === 'Empresas')

describe('plantillas de la carpeta Empresas', () => {
  it('hay siete, con código SC-EMP-001 a 007 en el cuadro de control', () => {
    expect(empresas).toHaveLength(7)
    const codes = empresas.map(
      (t) => /SC-EMP-\d{3}/.exec(buildTemplateContent(t).contentHtml)?.[0],
    )
    expect(codes).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `SC-EMP-00${n}`))
  })

  it('todas llevan cuadro de control con versión y fecha', () => {
    for (const t of empresas) {
      const html = buildTemplateContent(t).contentHtml
      expect(html).toContain('<th colspan="1" rowspan="1"><p>Código</p></th>')
      expect(html).toContain('<p>1.0</p>')
      expect(html).toContain('{{fecha}}')
    }
  })

  it('los listados salen con el tema interno y la propuesta con el comercial', () => {
    expect(themeForTemplate('Listado de empresas')).toBe('internal')
    expect(themeForTemplate('Listado de colaboradores de la empresa')).toBe(
      'internal',
    )
    expect(themeForTemplate('Propuesta de membresía corporativa')).toBe(
      'proposal',
    )
  })

  it('los nombres no se repiten en el catálogo', () => {
    const names = DEFAULT_TEMPLATES.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
