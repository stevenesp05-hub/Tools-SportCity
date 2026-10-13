/** Diccionario español (dictionary-es, copiado a public/dict para servirlo tal cual al worker). */
const affUrl = '/dict/es.aff'
const dicUrl = '/dict/es.dic'
import type { WorkerRequest, WorkerResponse } from './worker'

/** Palabras del club que el diccionario general no conoce; el resto las añade cada persona. */
const BRAND_WORDS = [
  'Sport',
  'City',
  'Wilmer',
  'Espinoza',
  'WhatsApp',
  'futsal',
  'forfait',
  'RRHH',
  'INSS',
  'FENIFUT',
  'Instagram',
  'Facebook',
  'TikTok',
  'online',
  'email',
]
const STORAGE_KEY = 'sc-spell-personal'

function personalWords(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (value: never) => void>()
const known = new Map<string, boolean>() // palabra → bien escrita
const listeners = new Set<() => void>()
let ready = false

function ensureWorker(): Worker | null {
  if (typeof window === 'undefined') return null
  if (worker) return worker
  worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  })
  worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data
    if (msg.type === 'ready') {
      ready = true
      listeners.forEach((fn) => fn())
    } else {
      pending.get(msg.id)?.(msg as never)
      pending.delete(msg.id)
    }
  })
  const init: WorkerRequest = {
    type: 'init',
    affUrl,
    dicUrl,
    extra: [...BRAND_WORDS, ...personalWords()],
  }
  worker.postMessage(init)
  return worker
}

/** Avisa cuando el diccionario termina de cargar (para repintar los subrayados). */
export function onSpellReady(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function startSpellcheck() {
  ensureWorker()
}

function request<T>(msg: WorkerRequest & { id: number }): Promise<T> {
  const w = ensureWorker()
  return new Promise((resolve) => {
    if (!w) return resolve([] as T)
    pending.set(msg.id, resolve as never)
    w.postMessage(msg)
  })
}

/** Devuelve el subconjunto de `words` mal escrito. Recuerda lo ya consultado. */
export async function misspelled(words: string[]): Promise<Set<string>> {
  const unknown = words.filter((w) => !known.has(w))
  if (unknown.length > 0 && ensureWorker()) {
    const res = await request<{ wrong: string[] }>({
      type: 'check',
      id: nextId++,
      words: unknown,
    })
    const wrong = new Set(res.wrong)
    for (const w of unknown) known.set(w, !wrong.has(w))
  }
  return new Set(words.filter((w) => known.get(w) === false))
}

export async function suggestionsFor(word: string): Promise<string[]> {
  const res = await request<{ list: string[] }>({
    type: 'suggest',
    id: nextId++,
    word,
  })
  return res.list
}

export function addToDictionary(word: string) {
  known.set(word, true)
  worker?.postMessage({ type: 'add', word } satisfies WorkerRequest)
  try {
    const list = new Set(personalWords())
    list.add(word)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...list]))
  } catch {
    /* sin almacenamiento: solo vale para esta sesión */
  }
}

export function isSpellReady() {
  return ready
}
