import { useEffect, useMemo, useRef, useState } from 'react'
import { getDocumentPreviews } from '#/server/library'
import type { DocumentPreview } from '#/server/library'
import { cn } from '#/lib/utils'
import { visualFor } from '#/components/documents/visuals'

const PAGE_W = 8.5 * 96

const cache = new Map<string, DocumentPreview | null>()
const waiting = new Map<
  string,
  Array<(value: DocumentPreview | null) => void>
>()
let timer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  timer = null
  const ids = [...waiting.keys()].slice(0, 24)
  const callbacks = ids.map((id) => [id, waiting.get(id) ?? []] as const)
  ids.forEach((id) => waiting.delete(id))
  let result: Record<string, DocumentPreview> = {}
  try {
    result = await getDocumentPreviews({ data: { ids } })
  } catch {
    /* sin vista previa: se queda el esqueleto */
  }
  for (const [id, list] of callbacks) {
    const value = (result[id] as DocumentPreview | undefined) ?? null
    cache.set(id, value)
    list.forEach((cb) => cb(value))
  }
  if (waiting.size > 0) timer = setTimeout(() => void flush(), 30)
}

/** Pide la vista previa de un documento; las peticiones que llegan juntas viajan en una sola llamada. */
function requestPreview(id: string): Promise<DocumentPreview | null> {
  if (cache.has(id)) return Promise.resolve(cache.get(id) ?? null)
  return new Promise((resolve) => {
    const list = waiting.get(id) ?? []
    list.push(resolve)
    waiting.set(id, list)
    timer ??= setTimeout(() => void flush(), 40)
  })
}

export function usePreview(id: string, enabled = true) {
  const [preview, setPreview] = useState<DocumentPreview | null | undefined>(
    cache.has(id) ? cache.get(id) : undefined,
  )
  useEffect(() => {
    if (!enabled || preview !== undefined) return
    let cancelled = false
    void requestPreview(id).then((value) => {
      if (!cancelled) setPreview(value)
    })
    return () => {
      cancelled = true
    }
  }, [id, enabled, preview])
  return preview
}

/**
 * Quita el membrete de marca (logo + cuadro de control «Código / Versión…») de la miniatura:
 * es igual en todas las plantillas y no ayuda a distinguir un documento de otro.
 */
function withoutLetterhead(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const body = new DOMParser().parseFromString(html, 'text/html').body
  const nodes = [...body.children]
  const index = nodes.findIndex(
    (node, i) =>
      i < 8 &&
      node.tagName === 'TABLE' &&
      /c[oó]digo/i.test(node.textContent) &&
      /versi[oó]n/i.test(node.textContent),
  )
  if (index === -1 || nodes.length - index < 3) return html
  nodes.slice(0, index + 1).forEach((node) => node.remove())
  return body.innerHTML
}

/** Miniatura de la primera página de un documento, con el mismo papel y estilos que el editor. */
export function DocThumbnail({
  id,
  title,
  className,
  ratio = 0.78,
}: {
  id: string
  title: string
  className?: string
  /** Ancho / alto de la miniatura (una hoja carta completa es 0.77). */
  ratio?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [scale, setScale] = useState(0.25)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const resize = new ResizeObserver(() =>
      setScale(el.clientWidth / PAGE_W || 0.25),
    )
    resize.observe(el)
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '240px' },
    )
    io.observe(el)
    return () => {
      resize.disconnect()
      io.disconnect()
    }
  }, [])

  const preview = usePreview(id, visible)
  const tone = visualFor(preview?.folderName ?? title).tone
  const html = useMemo(
    () => (preview ? withoutLetterhead(preview.html) : ''),
    [preview],
  )

  return (
    <div
      ref={ref}
      style={{ aspectRatio: String(ratio) }}
      className={cn(
        'doc-sheet pointer-events-none relative w-full overflow-hidden bg-[var(--sc-paper)]',
        className,
      )}
      aria-hidden
    >
      {preview ? (
        <div
          className="origin-top-left"
          style={{ width: PAGE_W, transform: `scale(${scale})` }}
        >
          <div style={{ padding: '0.7in 0.85in' }}>
            <div className="sheet-head">
              <div className="sheet-kicker" style={{ color: tone.bar }}>
                {preview.folderName}
              </div>
              <h1 className="sheet-title">{title}</h1>
            </div>
            <div
              className="ProseMirror"
              // HTML saneado en el servidor (sanitizeContentHtml).
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2 p-[8%]">
          <div className="h-1.5 w-1/3 rounded-md bg-primary/15" />
          <div className="h-3 w-3/4 rounded-md bg-primary/25" />
          {preview === undefined && (
            <div className="mt-3 space-y-1.5 animate-pulse">
              <div className="h-1.5 rounded-md bg-primary/10" />
              <div className="h-1.5 w-5/6 rounded-md bg-primary/10" />
              <div className="h-1.5 w-2/3 rounded-md bg-primary/10" />
            </div>
          )}
        </div>
      )}
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: tone.bar }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-[var(--sc-paper)] to-transparent" />
    </div>
  )
}
