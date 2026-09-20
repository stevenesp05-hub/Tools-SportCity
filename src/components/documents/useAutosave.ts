import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/react'
import { saveDraft } from '#/server/drafts'

export type LocalDraft = {
  base: string | null
  title: string
  content: JSONContent
  at: number
}

export type AutosaveState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'saving' }
  | { status: 'saved'; at: number }
  /** El servidor no admite borradores (falta la migración 0016): solo hay copia en este navegador. */
  | { status: 'local'; at: number }
  | { status: 'error'; message: string }

const DEBOUNCE_MS = 2500
const MAX_WAIT_MS = 12_000
const RETRY_MS = 8000

export const draftStorageKey = (documentId: string) => `sc-draft:${documentId}`

/** Copias locales aún por escribir (se escriben en un momento libre del navegador), por documento. */
const pendingLocal = new Map<string, { value: string; cancel: () => void }>()

function writeLocal(documentId: string, value: string) {
  try {
    localStorage.setItem(draftStorageKey(documentId), value)
  } catch {
    /* sin espacio o sin almacenamiento */
  }
}

/** Escribe ya la copia local pendiente de un documento (al ocultar la pestaña, al leerla o al salir). */
function flushPendingLocal(documentId: string) {
  const pending = pendingLocal.get(documentId)
  if (!pending) return
  pending.cancel()
  pendingLocal.delete(documentId)
  writeLocal(documentId, pending.value)
}

function dropPendingLocal(documentId: string) {
  pendingLocal.get(documentId)?.cancel()
  pendingLocal.delete(documentId)
}

/** Escribe la copia local cuando el navegador está libre (con un tope), para no bloquear al teclear. */
function scheduleLocal(documentId: string, value: string) {
  dropPendingLocal(documentId)
  const write = () => {
    pendingLocal.delete(documentId)
    writeLocal(documentId, value)
  }
  let cancel: () => void
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(write, { timeout: 2000 })
    cancel = () => cancelIdleCallback(handle)
  } else {
    const handle = setTimeout(write, 50)
    cancel = () => clearTimeout(handle)
  }
  pendingLocal.set(documentId, { value, cancel })
}

export function readLocalDraft(documentId: string): LocalDraft | null {
  flushPendingLocal(documentId)
  try {
    const raw = localStorage.getItem(draftStorageKey(documentId))
    return raw ? (JSON.parse(raw) as LocalDraft) : null
  } catch {
    return null
  }
}

export function clearLocalDraft(documentId: string) {
  dropPendingLocal(documentId)
  try {
    localStorage.removeItem(draftStorageKey(documentId))
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Autoguardado del documento en edición. Cada cambio programa (con debounce) dos copias:
 * una en este navegador (en un momento libre del navegador) y otra en el servidor (borrador por usuario, no ensucia el historial).
 * Si el servidor falla, la copia local se mantiene y se reintenta solo cada pocos segundos.
 */
export function useAutosave({
  documentId,
  enabled,
  serverEnabled,
  getSnapshot,
}: {
  documentId: string
  enabled: boolean
  serverEnabled: boolean
  getSnapshot: () => Omit<LocalDraft, 'at'> | null
}) {
  const [state, setState] = useState<AutosaveState>({ status: 'idle' })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstChange = useRef<number | null>(null)
  const running = useRef(false)
  const again = useRef(false)
  const serverOk = useRef(serverEnabled)
  /** Lo último que el servidor aceptó: si el borrador no cambió desde entonces, no se vuelve a enviar. */
  const lastSent = useRef<{ signature: string; at: number } | null>(null)
  const snapshotRef = useRef(getSnapshot)
  snapshotRef.current = getSnapshot
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    serverOk.current = serverEnabled
  }, [serverEnabled])

  // `deferLocal`: el autoguardado normal escribe la copia local en un momento libre; al ocultar la
  // pestaña o pedir el guardado a mano se escribe al instante.
  const execute = useCallback(
    async (deferLocal: boolean): Promise<void> => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      firstChange.current = null
      if (!enabledRef.current) return
      const snapshot = snapshotRef.current()
      if (!snapshot) return
      // Se serializa el contenido una sola vez: sirve para la copia local y para saber si cambió.
      const { content, ...meta } = snapshot
      const contentJson = JSON.stringify(content)
      const metaJson = JSON.stringify({ ...meta, at: Date.now() })
      const local = `${metaJson.slice(0, -1)},"content":${contentJson}}`
      if (deferLocal) {
        scheduleLocal(documentId, local)
      } else {
        dropPendingLocal(documentId)
        writeLocal(documentId, local)
      }
      if (!serverOk.current) {
        setState({ status: 'local', at: Date.now() })
        return
      }
      if (running.current) {
        again.current = true
        return
      }
      const signature = `${documentId}\n${JSON.stringify(meta)}\n${contentJson}`
      if (lastSent.current?.signature === signature) {
        setState({ status: 'saved', at: lastSent.current.at })
        return
      }
      running.current = true
      setState({ status: 'saving' })
      try {
        const result = await saveDraft({
          data: {
            documentId,
            baseVersionId: snapshot.base,
            title: snapshot.title,
            content: snapshot.content,
          },
        })
        if (result.ok) {
          lastSent.current = { signature, at: Date.parse(result.at) }
          setState({ status: 'saved', at: Date.parse(result.at) })
        } else if (result.unsupported) {
          serverOk.current = false
          setState({ status: 'local', at: Date.now() })
        } else {
          setState({ status: 'error', message: result.message })
          retryTimer.current = setTimeout(() => void execute(false), RETRY_MS)
        }
      } catch (error) {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Sin conexión',
        })
        retryTimer.current = setTimeout(() => void execute(false), RETRY_MS)
      } finally {
        running.current = false
        if (again.current) {
          again.current = false
          void execute(false)
        }
      }
    },
    [documentId],
  )

  const run = useCallback((): Promise<void> => execute(false), [execute])

  /** Avisa de que el documento cambió: programa el autoguardado. Es barato, se puede llamar en cada pulsación. */
  const notifyChange = useCallback(() => {
    if (!enabledRef.current) return
    if (retryTimer.current) clearTimeout(retryTimer.current)
    setState((current) =>
      current.status === 'pending' ? current : { status: 'pending' },
    )
    const now = Date.now()
    firstChange.current ??= now
    if (timer.current) clearTimeout(timer.current)
    const overdue = now - firstChange.current >= MAX_WAIT_MS
    timer.current = setTimeout(
      () => void execute(true),
      overdue ? 0 : DEBOUNCE_MS,
    )
  }, [execute])

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    if (retryTimer.current) clearTimeout(retryTimer.current)
    timer.current = null
    retryTimer.current = null
    firstChange.current = null
    lastSent.current = null
    dropPendingLocal(documentId)
    setState({ status: 'idle' })
  }, [documentId])

  // Al ocultar la pestaña o cerrarla, se guarda ya lo pendiente (la copia local se escribe al instante).
  useEffect(() => {
    if (!enabled) return
    const flush = () => {
      flushPendingLocal(documentId)
      if (timer.current || firstChange.current !== null) void run()
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', flush)
    }
  }, [enabled, run, documentId])

  // Al salir, lo que aún esté por escribir en local se escribe ya.
  useEffect(() => () => flushPendingLocal(documentId), [documentId])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (retryTimer.current) clearTimeout(retryTimer.current)
    },
    [],
  )

  return { state, notifyChange, flush: run, reset }
}
