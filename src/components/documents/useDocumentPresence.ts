import { useEffect, useState } from 'react'
import { pingEditing, stopEditing } from '#/server/library'
import type { EditingStatus } from '#/server/library'

/** Editando hay que renovar la marca antes de que caduque (45 s); leyendo basta con avisos más espaciados. */
const EDITING_PING_MS = 15_000
const READING_PING_MS = 45_000

/**
 * Sondea quién más está editando el documento y cuál es su última versión guardada.
 * Se pausa con la pestaña oculta y, al volver, hace un sondeo inmediato.
 */
export function useDocumentPresence(documentId: string, editing: boolean) {
  const [status, setStatus] = useState<EditingStatus>({
    editors: [],
    latestVersionId: null,
  })

  useEffect(() => {
    let cancelled = false
    const ping = () => {
      pingEditing({ data: { documentId, editing } })
        .then((next) => {
          if (!cancelled) setStatus(next)
        })
        .catch(() => undefined)
    }
    const every = editing ? EDITING_PING_MS : READING_PING_MS
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => {
      ping()
      timer = setInterval(ping, every)
    }
    const stop = () => {
      clearInterval(timer)
      timer = undefined
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else if (timer === undefined) start()
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      if (editing)
        void stopEditing({ data: { documentId } }).catch(() => undefined)
    }
  }, [documentId, editing])

  return status
}
