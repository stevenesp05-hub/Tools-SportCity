import { beforeAll, describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'

// El entorno de pruebas corre en Node: no hay `DOMParser` global como en el navegador.
// happy-dom ya es dependencia del proyecto (import-html.ts la usa igual), así que se
// presta su propio `DOMParser` solo para este archivo de pruebas; en producción, dentro
// del navegador, `cleanPastedHtml` usa el `DOMParser` nativo, sin pasar por happy-dom.
beforeAll(() => {
  const win = new Window()
  globalThis.DOMParser = win.DOMParser as unknown as typeof DOMParser
})

const { cleanPastedHtml } = await import('../paste-clean')

describe('cleanPastedHtml', () => {
  it('quita el atributo style de cada elemento', () => {
    const html = '<p style="color:red;font-size:14pt">Hola</p>'
    expect(cleanPastedHtml(html)).toBe('<p>Hola</p>')
  })

  it('quita el atributo class (clases de Word/Docs tipo MsoNormal)', () => {
    const html = '<p class="MsoNormal">Hola</p>'
    expect(cleanPastedHtml(html)).toBe('<p>Hola</p>')
  })

  it('elimina bloques <style> y <script> en vez de dejarlos como texto suelto', () => {
    const html =
      '<style>p.MsoNormal{margin:0}</style><p>Hola</p><script>alert(1)</script>'
    const out = cleanPastedHtml(html)
    expect(out).not.toContain('margin:0')
    expect(out).not.toContain('alert')
    expect(out).toBe('<p>Hola</p>')
  })

  it('conserva la estructura semántica: negrita, enlaces, listas y tablas', () => {
    const html =
      '<p><strong style="font-weight:700">Negrita</strong> y <a href="https://x.com" style="color:blue">enlace</a></p>' +
      '<ul><li style="margin:0">uno</li></ul>' +
      '<table><tr><td colspan="2" style="background:yellow">celda</td></tr></table>'
    const out = cleanPastedHtml(html)
    expect(out).toContain('<strong>Negrita</strong>')
    expect(out).toContain('<a href="https://x.com">enlace</a>')
    expect(out).toContain('<li>uno</li>')
    expect(out).toContain('<td colspan="2">celda</td>')
    expect(out).not.toContain('style=')
  })

  it('no toca el marcador interno data-pm-slice que usa ProseMirror para el copiar/pegar dentro del propio editor', () => {
    const html =
      '<div data-pm-slice="0 0 []" style="color:red" class="foo"><p>contenido</p></div>'
    const out = cleanPastedHtml(html)
    expect(out).toContain('data-pm-slice="0 0 []"')
    expect(out).not.toContain('style=')
    expect(out).not.toContain('class=')
  })
})
