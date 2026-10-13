import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import {
  misspelled,
  onSpellReady,
  startSpellcheck,
} from '#/lib/spellcheck/client'

export const spellcheckKey = new PluginKey<DecorationSet>('spellcheck')

const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu

type Found = { from: number; to: number; word: string }

/** Palabras del documento que merece la pena comprobar (con su posición). */
function collectWords(view: EditorView): Found[] {
  const found: Found[] = []
  view.state.doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text) return
    if (parent?.type.name === 'codeBlock') return
    // Enlaces y código: no son prosa.
    if (
      node.marks.some((m) => m.type.name === 'link' || m.type.name === 'code')
    )
      return
    for (const match of node.text.matchAll(WORD)) {
      const word = match[0]
      if (word.length < 2) continue
      // Siglas (RRHH, INSS): todo en mayúscula.
      if (word === word.toUpperCase() && word.length <= 6) continue
      // Direcciones y rutas pegadas: la palabra va pegada a @, / o .ext
      const idx = match.index ?? 0
      const before = node.text[idx - 1]
      const after = node.text[idx + word.length]
      if (before === '@' || before === '/' || after === '@' || after === '/')
        continue
      found.push({ from: pos + idx, to: pos + idx + word.length, word })
    }
  })
  return found
}

/**
 * Corrector ortográfico propio (español): subraya con una línea roja ondulada las palabras que el
 * diccionario no conoce. Corre en un worker y se carga solo al abrir un documento editable; nada
 * del texto sale del navegador. Los subrayados son decoraciones: no se guardan en el documento.
 */
export const Spellcheck = Extension.create({
  name: 'spellcheck',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<DecorationSet>({
        key: spellcheckKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const next = tr.getMeta(spellcheckKey) as DecorationSet | undefined
            return next ?? set.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations: (state) => spellcheckKey.getState(state),
        },
        view(view) {
          let timer: ReturnType<typeof setTimeout> | undefined
          let run = 0
          let destroyed = false

          const check = async () => {
            if (destroyed || !editor.isEditable) return
            const mine = ++run
            const found = collectWords(view)
            const wrong = await misspelled([
              ...new Set(found.map((f) => f.word)),
            ])
            if (destroyed || mine !== run) return
            const decos = found
              .filter((f) => wrong.has(f.word))
              .map((f) =>
                Decoration.inline(
                  f.from,
                  f.to,
                  { class: 'sc-misspelled' },
                  { word: f.word },
                ),
              )
            view.dispatch(
              view.state.tr
                .setMeta(
                  spellcheckKey,
                  DecorationSet.create(view.state.doc, decos),
                )
                .setMeta('addToHistory', false),
            )
          }
          const schedule = (delay = 500) => {
            clearTimeout(timer)
            timer = setTimeout(() => void check(), delay)
          }

          if (editor.isEditable) startSpellcheck()
          const off = onSpellReady(() => schedule(0))
          schedule(800)
          return {
            update(v, prev) {
              if (!v.state.doc.eq(prev.doc)) schedule()
            },
            destroy() {
              destroyed = true
              clearTimeout(timer)
              off()
            },
          }
        },
      }),
    ]
  },
})

/** La palabra mal escrita que hay en la posición `pos`, si la hay. */
export function misspelledAt(
  view: EditorView,
  pos: number,
): { from: number; to: number; word: string } | null {
  const set = spellcheckKey.getState(view.state)
  const hit = set?.find(pos, pos)[0]
  if (!hit) return null
  return {
    from: hit.from,
    to: hit.to,
    word: (hit.spec as { word: string }).word,
  }
}

/** Quita los subrayados de una palabra (al ignorarla o añadirla al diccionario). */
export function dropWord(view: EditorView, word: string) {
  const set = spellcheckKey.getState(view.state)
  if (!set) return
  const stale = set
    .find()
    .filter((d) => (d.spec as { word: string }).word === word)
  view.dispatch(
    view.state.tr
      .setMeta(spellcheckKey, set.remove(stale))
      .setMeta('addToHistory', false),
  )
}
