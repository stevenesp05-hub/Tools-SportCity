import { useEffect, useState } from 'react'
import { getTemplatePreviews } from '#/server/documents'

export type TemplatePreview = { html: string; variables: string[] }

/** Las vistas previas se recuerdan un rato; pasado ese tiempo se vuelven a pedir (así no se ven plantillas ya actualizadas con su versión antigua). */
const TTL_MS = 30_000
const cache = new Map<string, TemplatePreview | null>()
const cachedAt = new Map<string, number>()

const fresh = (id: string) =>
  cache.has(id) && Date.now() - (cachedAt.get(id) ?? 0) < TTL_MS

/** Olvida todas las vistas previas (p. ej. tras instalar o actualizar plantillas). */
export function clearTemplatePreviewCache() {
  cache.clear()
  cachedAt.clear()
}
const waiting = new Map<
  string,
  Array<(value: TemplatePreview | null) => void>
>()
let timer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  timer = null
  const ids = [...waiting.keys()].slice(0, 24)
  const callbacks = ids.map((id) => [id, waiting.get(id) ?? []] as const)
  ids.forEach((id) => waiting.delete(id))
  let result: Record<string, TemplatePreview> = {}
  try {
    result = await getTemplatePreviews({ data: { ids } })
  } catch {
    /* sin vista previa: la tarjeta se queda con el esqueleto */
  }
  for (const [id, list] of callbacks) {
    const value = (result[id] as TemplatePreview | undefined) ?? null
    cache.set(id, value)
    cachedAt.set(id, Date.now())
    list.forEach((callback) => callback(value))
  }
  if (waiting.size > 0) timer = setTimeout(() => void flush(), 30)
}

function request(id: string): Promise<TemplatePreview | null> {
  if (fresh(id)) return Promise.resolve(cache.get(id) ?? null)
  return new Promise((resolve) => {
    const list = waiting.get(id) ?? []
    list.push(resolve)
    waiting.set(id, list)
    timer ??= setTimeout(() => void flush(), 40)
  })
}

/** Vista previa (HTML saneado) de una plantilla; las que se piden a la vez viajan en una sola llamada. */
export function useTemplatePreview(id: string | null, enabled = true) {
  const [preview, setPreview] = useState<TemplatePreview | null | undefined>(
    id && fresh(id) ? cache.get(id) : undefined,
  )
  useEffect(() => {
    if (!id || !enabled) return
    if (fresh(id)) {
      setPreview(cache.get(id))
      return
    }
    let cancelled = false
    void request(id).then((value) => {
      if (!cancelled) setPreview(value)
    })
    return () => {
      cancelled = true
    }
  }, [id, enabled])
  return preview
}
