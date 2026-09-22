import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { SCHEMA_EXTENSIONS, pageBreakTransaction } from '../editor-extensions'

const schema = getSchema(SCHEMA_EXTENSIONS)
const n = schema.nodes
const p = (text?: string) =>
  n.paragraph.create(null, text ? schema.text(text) : undefined)
const doc = (...children: PMNode[]) => n.doc.create(null, children)

/** Posición del texto `marker` dentro del documento, más `offset` caracteres. */
function at(root: PMNode, marker: string, offset = 0) {
  let found = -1
  root.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return
    const i = node.text?.indexOf(marker) ?? -1
    if (i >= 0) found = pos + i + offset
  })
  if (found < 0) throw new Error(`no encontré «${marker}»`)
  return found
}

function run(root: PMNode, from: number, to = from) {
  const state = EditorState.create({
    doc: root,
    selection: TextSelection.create(root, from, to),
  })
  const tr = pageBreakTransaction(state)
  if (!tr) return null
  const next = state.apply(tr)
  const shape = next.doc.content.content.map((c) =>
    c.type.name === 'paragraph' ? `p:${c.textContent}` : c.type.name,
  )
  return { shape, cursor: next.selection.$from, next }
}

describe('salto de página (Ctrl+Enter)', () => {
  it('al final de un párrafo: salto debajo y cursor en una línea vacía de la hoja nueva', () => {
    const d = doc(p('Primero'), p('Segundo'))
    const r = run(d, at(d, 'Primero', 7))!
    expect(r.shape).toEqual(['p:Primero', 'pageBreak', 'p:', 'p:Segundo'])
    expect(r.cursor.parent.textContent).toBe('')
    expect(r.cursor.parent.type.name).toBe('paragraph')
    expect(r.cursor.index(0)).toBe(2)
  })

  it('en medio de un párrafo: el resto del texto pasa a la hoja nueva', () => {
    const d = doc(p('AntesDespués'))
    const r = run(d, at(d, 'AntesDespués', 5))!
    expect(r.shape).toEqual(['p:Antes', 'pageBreak', 'p:Después'])
    expect(r.cursor.parentOffset).toBe(0)
    expect(r.cursor.parent.textContent).toBe('Después')
  })

  it('al principio de un párrafo: el salto va encima y no sobra ninguna línea vacía', () => {
    const d = doc(p('Uno'), p('Dos'))
    const r = run(d, at(d, 'Dos', 0))!
    expect(r.shape).toEqual(['p:Uno', 'pageBreak', 'p:Dos'])
    expect(r.cursor.parent.textContent).toBe('Dos')
    expect(r.cursor.parentOffset).toBe(0)
  })

  it('en un documento vacío deja el salto y una línea debajo', () => {
    const d = doc(p())
    const r = run(d, 1)!
    expect(r.shape).toEqual(['pageBreak', 'p:'])
    expect(r.cursor.parent.type.name).toBe('paragraph')
  })

  it('con texto seleccionado lo reemplaza por el salto', () => {
    const d = doc(p('Hola mundo'))
    const from = at(d, 'Hola mundo', 4)
    const r = run(d, from, from + 6)!
    expect(r.shape).toEqual(['p:Hola', 'pageBreak', 'p:'])
  })

  it('dentro de una lista el salto va después de toda la lista', () => {
    const list = n.bulletList.create(null, [
      n.listItem.create(null, p('uno')),
      n.listItem.create(null, p('dos')),
    ])
    const d = doc(p('Antes'), list, p('Después'))
    const r = run(d, at(d, 'uno', 1))!
    expect(r.shape).toEqual([
      'p:Antes',
      'bulletList',
      'pageBreak',
      'p:',
      'p:Después',
    ])
  })

  it('dentro de un bloque de código no hace nada (Ctrl+Enter conserva su función)', () => {
    const d = doc(n.codeBlock.create(null, schema.text('let a = 1')))
    expect(run(d, 4)).toBeNull()
  })

  it('cada salto deja el documento válido para el esquema', () => {
    const d = doc(p('Uno'), p('Dos'), p('Tres'))
    for (const marker of ['Uno', 'Dos', 'Tres'])
      for (const offset of [0, 1, marker.length]) {
        const r = run(d, at(d, marker, offset))!
        expect(() => r.next.doc.check()).not.toThrow()
      }
  })
})
