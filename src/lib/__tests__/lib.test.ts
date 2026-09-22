import { describe, expect, it } from 'vitest'
import { extractHeadings, extractText, htmlToText } from '../document-text'
import { buildSnippet, normalizeText } from '../search-utils'
import { hasPermission } from '../permissions'
import { sanitizeContentHtml } from '../sanitize.server'
import { folderChainOf } from '../breadcrumbs'

import { DEFAULT_TEMPLATES, buildTemplateContent } from '../default-templates'

const folder = (
  id: string,
  parent_id: string | null,
  name = id,
): {
  id: string
  name: string
  parent_id: string | null
  visible_roles: null
} => ({
  id,
  name,
  parent_id,
  visible_roles: null,
})

describe('folderChainOf', () => {
  const folders = [
    folder('a', null, 'Alcances'),
    folder('b', 'a', 'Eventos'),
    folder('c', 'b', '2026'),
  ]

  it('devuelve la ruta de la raíz a la carpeta, en ese orden', () => {
    expect(folderChainOf(folders, 'c').map((f) => f.name)).toEqual([
      'Alcances',
      'Eventos',
      '2026',
    ])
    expect(folderChainOf(folders, 'a').map((f) => f.name)).toEqual(['Alcances'])
  })

  it('vacío sin id, con un id que no existe, o con un ciclo accidental', () => {
    expect(folderChainOf(folders, null)).toEqual([])
    expect(folderChainOf(folders, 'zzz')).toEqual([])
    const cyclic = [folder('x', 'y'), folder('y', 'x')]
    expect(() => folderChainOf(cyclic, 'x')).not.toThrow()
    expect(folderChainOf(cyclic, 'x').length).toBeLessThanOrEqual(2)
  })
})

describe('extractText', () => {
  it('une el texto de bloques y celdas', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'Balones' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Proveedor A' }] },
      ],
    }
    expect(extractText(doc)).toBe('Balones Proveedor A')
  })
})

describe('htmlToText / extractHeadings', () => {
  it('quita etiquetas y decodifica entidades', () => {
    expect(htmlToText('<p>Uno &amp; dos</p><p>tres</p>')).toBe(
      'Uno & dos\ntres',
    )
  })
  it('lista los h2', () => {
    expect(
      extractHeadings('<h2>Reservas</h2><p>x</p><h2><strong>Bar</strong></h2>'),
    ).toEqual(['Reservas', 'Bar'])
  })
})

describe('búsqueda', () => {
  it('normaliza tildes y mayúsculas', () => {
    expect(normalizeText('Fútbol Sálá')).toBe('futbol sala')
  })
  it('construye fragmento sin distinguir tildes', () => {
    const s = buildSnippet('El reglamento del torneo de fútbol sala', 'futbol')
    expect(s?.match).toBe('fútbol')
    expect(s?.before).toContain('torneo')
  })
  it('devuelve null si no hay coincidencia', () => {
    expect(buildSnippet('hola mundo', 'zzz')).toBeNull()
  })
})

describe('permisos', () => {
  it('solo admin elimina y aprueba documentos', () => {
    expect(hasPermission('admin', 'tools.documentos.eliminar')).toBe(true)
    expect(hasPermission('recepcion', 'tools.documentos.eliminar')).toBe(false)
    expect(hasPermission('admin', 'tools.documentos.aprobar')).toBe(true)
    expect(hasPermission('recepcion', 'tools.documentos.aprobar')).toBe(false)
  })
  it('sin rol no hay permisos', () => {
    expect(hasPermission(null, 'tools.documentos.ver')).toBe(false)
  })
})

describe('sanitizeContentHtml', () => {
  it('elimina scripts y manejadores', () => {
    const out = sanitizeContentHtml(
      '<p onclick="x()">Hola</p><script>alert(1)</script><img src="x" onerror="y()">',
    )
    expect(out).not.toContain('script')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onerror')
    expect(out).toContain('Hola')
  })
  it('bloquea file:// y javascript:', () => {
    const out = sanitizeContentHtml(
      '<img src="file:///etc/passwd"><a href="javascript:alert(1)">x</a>',
    )
    expect(out).not.toContain('file:')
    expect(out).not.toContain('javascript:')
  })
  it('conserva tablas e imágenes internas', () => {
    const out = sanitizeContentHtml(
      '<table><tbody><tr><th colspan="1">A</th></tr></tbody></table><img src="/api/imagenes/a.png">',
    )
    expect(out).toContain('<th colspan="1">A</th>')
    // Las URL antiguas con extensión se sirven sin ella (ver images.server.ts).
    expect(out).toContain('/api/imagenes/a"')
    expect(out).not.toContain('a.png')
    expect(sanitizeContentHtml('<img src="/api/imagenes/0f3c-1">')).toContain(
      '/api/imagenes/0f3c-1',
    )
  })
})

describe('plantillas base', () => {
  it('tienen nombre único y contenido válido', () => {
    const names = DEFAULT_TEMPLATES.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const template of DEFAULT_TEMPLATES) {
      const { content, contentHtml } = buildTemplateContent(template)
      expect(content.type).toBe('doc')
      expect(content.content?.length).toBeGreaterThan(3)
      expect(contentHtml, template.name).toContain('<table>')
      // el HTML generado sobrevive al saneado (avisos y tablas incluidos)
      const clean = sanitizeContentHtml(contentHtml)
      expect(clean.length).toBeGreaterThan(contentHtml.length * 0.95)
    }
  })
  it('hay un catálogo amplio y todas llevan cuadro de control (sin repetir el logo)', () => {
    expect(DEFAULT_TEMPLATES.length).toBeGreaterThanOrEqual(50)
    for (const template of DEFAULT_TEMPLATES) {
      const { contentHtml } = buildTemplateContent(template)
      expect(contentHtml, template.name).not.toContain('/brand/logo-mark.png')
      expect(contentHtml, template.name).toContain(
        '<th colspan="1" rowspan="1"><p>Código</p></th>',
      )
    }
  })
  it('conservan avisos y tablas al sanear', () => {
    const html = buildTemplateContent(DEFAULT_TEMPLATES[0]).contentHtml
    const clean = sanitizeContentHtml(html)
    expect(clean).toContain('data-callout')
    expect(clean).toContain('<table>')
  })
})

describe('promoteHeaderRows', () => {
  it('mueve la fila de encabezados a thead y no toca filas de datos', async () => {
    const { promoteHeaderRows } = await import('../pdf-template')
    const html =
      '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>'
    expect(promoteHeaderRows(html)).toBe(
      '<table><thead><tr><th><p>A</p></th><th><p>B</p></th></tr></thead><tbody><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>',
    )
    const plain = '<table><tbody><tr><td><p>1</p></td></tr></tbody></table>'
    expect(promoteHeaderRows(plain)).toBe(plain)
  })
})

describe('sanitizeContentHtml con formato', () => {
  it('conserva color, resaltado, alineación, imágenes con pie, tareas y saltos de página', () => {
    const html =
      '<p style="text-align: center"><span style="color: #c2542b">Rojo</span> <mark style="background-color: #fff3b0; color: inherit">marca</mark></p>' +
      '<figure class="sc-figure" data-align="right" style="width: 50%"><img src="/api/imagenes/a.png"><figcaption>Pie</figcaption></figure>' +
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><div><p>Hecho</p></div></li></ul>' +
      '<div data-page-break></div>' +
      '<table><tbody><tr><td style="background-color: #d7e9fb"><p>x</p></td></tr></tbody></table>'
    const out = sanitizeContentHtml(html)
    expect(out).toContain('text-align:center')
    expect(out).toContain('color:#c2542b')
    expect(out).toContain('background-color:#fff3b0')
    expect(out).toContain('data-align="right"')
    expect(out).toContain('<figcaption>Pie</figcaption>')
    expect(out).toContain('data-type="taskItem"')
    expect(out).toContain('data-page-break')
    expect(out).toContain('background-color:#d7e9fb')
  })

  it('descarta estilos y atributos peligrosos', () => {
    const out = sanitizeContentHtml(
      '<p style="position: fixed; background: url(http://x/y); color: red" onclick="x()">a</p><span style="color: expression(alert(1))">b</span>',
    )
    expect(out).not.toContain('position')
    expect(out).not.toContain('url(')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('expression')
    expect(out).not.toContain('color:red')
  })
})

describe('template-variables', () => {
  it('extrae solo los campos personalizados y sustituye en HTML y JSON', async () => {
    const { extractVariables, fillHtml, fillJson, builtinValues } =
      await import('../template-variables')
    const html =
      '<p>{{fecha}} · {{Proveedor}} · {{ razon social }} · {{proveedor}}</p>'
    expect(extractVariables(html)).toEqual(['proveedor', 'razon_social'])
    const values = {
      ...builtinValues({
        userName: 'Ana',
        folderName: 'Proveedores',
        now: new Date('2026-09-19T12:00:00'),
      }),
      proveedor: 'A & B <x>',
      razon_social: 'SA',
    }
    expect(fillHtml(html, values)).toContain('A &amp; B &lt;x&gt;')
    expect(fillHtml(html, values)).toContain('SA')
    const json = fillJson(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Para {{proveedor}} el {{fecha}}',
                marks: [{ type: 'bold' }],
              },
            ],
          },
        ],
      },
      values,
    )
    const text = json.content?.[0].content?.[0]
    expect(text?.text).toContain('A & B <x>')
    expect(text?.marks).toEqual([{ type: 'bold' }])
  })
})

describe('checkDocument', () => {
  const cell = (text: string) => ({
    type: 'tableCell',
    content: [
      {
        type: 'paragraph',
        content: text ? [{ type: 'text', text }] : [],
      },
    ],
  })
  const row = (...texts: string[]) => ({
    type: 'tableRow',
    content: texts.map(cell),
  })
  const table = (...rows: ReturnType<typeof row>[]) => ({
    type: 'table',
    content: rows,
  })
  const doc = (...content: object[]) => ({ type: 'doc', content })

  it('detecta un total que no coincide con la suma', async () => {
    const { checkDocument } = await import('../doc-checks')
    const checks = checkDocument(
      doc(
        table(
          row('Concepto', 'Importe'),
          row('Balones', 'C$ 1,000.00'),
          row('Redes', 'C$ 500.00'),
          row('Total', 'C$ 1,600.00'),
        ),
      ),
    )
    expect(checks[0].level).toBe('error')
    expect(checks[0].detail).toContain('1,500')
  })

  it('confirma un total correcto y avisa de campos sin rellenar', async () => {
    const { checkDocument } = await import('../doc-checks')
    const good = checkDocument(
      doc(
        table(
          row('Concepto', 'Importe'),
          row('A', '10'),
          row('B', '5.5'),
          row('Total', '15.5'),
        ),
      ),
    )
    expect(good.some((c) => c.level === 'ok')).toBe(true)
    expect(good.some((c) => c.level === 'error')).toBe(false)

    const pending = checkDocument(
      doc({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Para [Nombre del cliente] y {{evento.fecha}}',
          },
        ],
      }),
    )
    expect(pending[0].level).toBe('warn')
    expect(pending[0].title).toContain('2 campos')
  })
})

describe('temas de documento', () => {
  it('sugiere un tema según plantilla o carpeta y valida los valores', async () => {
    const { suggestTheme, themeOf, themeCssVars } =
      await import('../doc-themes')
    expect(suggestTheme('Ficha de evento', 'Reservas')).toBe('event')
    expect(suggestTheme('Presupuesto', 'Proveedores')).toBe('proposal')
    expect(suggestTheme('Manual de uso', 'Manuales')).toBe('report')
    expect(suggestTheme('Checklist', 'Operaciones')).toBe('internal')
    expect(suggestTheme('Carta oficial', 'Documentación')).toBe('corporate')
    expect(themeOf('inexistente')).toBe('corporate')
    expect(themeCssVars('proposal')['--t-navy']).toBe('#14284b')
  })
})

describe('campos dinámicos con entidad', () => {
  it('admite {{cliente.nombre}} y lo etiqueta como Cliente · nombre', async () => {
    const { extractVariables, fillHtml, variableLabel } =
      await import('../template-variables')
    const html =
      '<p>{{cliente.nombre}} · {{evento.fecha}} · {{Cliente.Nombre}}</p>'
    expect(extractVariables(html)).toEqual(['cliente.nombre', 'evento.fecha'])
    expect(variableLabel('cliente.nombre')).toBe('Cliente · nombre')
    expect(
      fillHtml(html, { 'cliente.nombre': 'Ana', 'evento.fecha': '5 de mayo' }),
    ).toBe('<p>Ana · 5 de mayo · Ana</p>')
  })
})

describe('PDF con tema', () => {
  it('aplica la paleta del tema en portada, cuerpo y pie', async () => {
    const { renderContentHtml, renderCoverHtml, renderChromeOverlayHtml } =
      await import('../pdf-template')
    const input = {
      theme: 'proposal' as const,
      title: 'Presupuesto',
      folderName: 'Presupuestos',
      contentHtml: '<h2>Total</h2><p>x</p>',
      headings: ['Total'],
      versionNumber: 1,
      updatedAt: '2026-09-19T12:00:00Z',
      authorName: null,
      status: 'borrador' as const,
      approvedBy: null,
      approvedAt: null,
    }
    for (const html of [
      renderContentHtml(input),
      renderCoverHtml(input),
      renderChromeOverlayHtml(input, 2),
    ]) {
      expect(html).toContain('--t-navy: #14284b')
      // Los valores de reserva de `var(--x, #1e1a6b)` no cuentan: solo importa que no haya colores fijos.
      expect(html.replaceAll(', #1e1a6b)', ')')).not.toContain('#1e1a6b')
    }
  })
})

describe('catálogo de plantillas', () => {
  it('cada plantilla tiene categoría y tema, y hay variedad de temas', async () => {
    const { categoryOf, themeForTemplate, TEMPLATE_CATEGORIES } =
      await import('../template-catalog')
    const themes = new Set<string>()
    const categories = new Set<string>()
    for (const template of DEFAULT_TEMPLATES) {
      themes.add(themeForTemplate(template.name))
      categories.add(categoryOf(template.name))
    }
    // Todas las categorías declaradas tienen plantillas y se usan los cinco temas.
    expect(categories.size).toBe(TEMPLATE_CATEGORIES.length)
    expect(themes.size).toBe(5)
    expect(categoryOf('Cotización a cliente')).toBe('comercial')
    expect(themeForTemplate('Cotización a cliente')).toBe('proposal')
    expect(themeForTemplate('Checklist de apertura y cierre')).toBe('internal')
    expect(themeForTemplate('Carta oficial')).toBe('corporate')
    expect(categoryOf('Acta de partido')).toBe('eventos')
  })
})

describe('búsqueda de bloques', () => {
  const items = [
    { title: 'Tabla', keywords: 'tabla filas', group: 'Bloques' },
    {
      title: 'Tabla de control',
      keywords: 'control codigo version',
      group: 'Sport City',
    },
    {
      title: 'Aviso informativo',
      keywords: 'aviso nota tabla',
      group: 'Bloques',
    },
    { title: 'Título', keywords: 'titulo encabezado', group: 'Básicos' },
  ]
  it('pone antes lo que coincide con el título y tolera tildes y letras sueltas', async () => {
    const { rankBlocks } = await import('../block-search')
    expect(rankBlocks(items, 'tabla', []).map((i) => i.title)).toEqual([
      'Tabla',
      'Tabla de control',
      'Aviso informativo',
    ])
    expect(rankBlocks(items, 'titulo', [])[0].title).toBe('Título')
    expect(rankBlocks(items, 'tbl', []).map((i) => i.title)).toContain('Tabla')
    expect(rankBlocks(items, 'zzz', [])).toEqual([])
  })
  it('sin búsqueda, los recientes van primero y no se repiten', async () => {
    const { rankBlocks } = await import('../block-search')
    const ranked = rankBlocks(items, '', ['Título'])
    expect(ranked[0]).toMatchObject({ title: 'Título', group: 'Recientes' })
    expect(ranked.filter((i) => i.title === 'Título')).toHaveLength(1)
  })
})

describe('tablas: alto de fila y ancho de columna', () => {
  it('el saneado conserva el alto de fila (px) y los anchos de columna', () => {
    const out = sanitizeContentHtml(
      '<table><colgroup><col style="width: 158px"><col style="width: 317px"></colgroup><tbody><tr style="height: 80px"><td colwidth="158"><p>A</p></td><td colwidth="317"><p>B</p></td></tr></tbody></table>',
    )
    expect(out).toContain('height:80px')
    expect(out).toContain('width:158px')
    expect(out).toContain('width:317px')
  })
  it('un alto de fila con unidades raras se descarta', () => {
    const out = sanitizeContentHtml(
      '<table><tbody><tr style="height: calc(100vh)"><td><p>A</p></td></tr></tbody></table>',
    )
    expect(out).not.toContain('calc')
  })
})
