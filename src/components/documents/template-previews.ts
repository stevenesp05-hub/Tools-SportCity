import { useEffect, useState } from 'react'
import { getTemplatePreviews } from '#/server/documents'

export type TemplatePreview = { html: string; variables: string[] }

const cache = new Map<string, TemplatePreview | null>()
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
    list.forEach((callback) => callback(value))
  }
  if (waiting.size > 0) timer = setTimeout(() => void flush(), 30)
}

function request(id: string): Promise<TemplatePreview | null> {
  if (cache.has(id)) return Promise.resolve(cache.get(id) ?? null)
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
    id && cache.has(id) ? cache.get(id) : undefined,
  )
  useEffect(() => {
    if (!id || !enabled) return
    if (cache.has(id)) {
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
