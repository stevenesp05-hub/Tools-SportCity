import { createHash } from 'node:crypto'
import { createLruCache } from '#/lib/lru-cache'
import { renderDocumentPdf } from '#/lib/pdf.server'
import type { DocumentPdfInput } from '#/lib/pdf-template'

// Generar un PDF cuesta un Chromium: Ctrl+P, la vista previa y la descarga de un mismo documento no deben repetirlo.
// Vive en la memoria de la instancia; en serverless se pierde al enfriarse y no se comparte, y no pasa nada.
const pdfCache = createLruCache<Buffer>({
  maxEntries: 20,
  maxBytes: 40 * 1024 * 1024,
  ttlMs: 10 * 60_000,
  sizeOf: (pdf) => pdf.length,
})
// Generaciones en curso: dos peticiones simultáneas del mismo PDF comparten una sola.
const inflight = new Map<string, Promise<Buffer>>()

/**
 * La clave lleva un hash de TODO lo que entra en el PDF (contenido con imágenes, título, carpeta, estado,
 * aprobador, tema, versión, fechas, autor) más la opción de portada: si algo cambia, la clave cambia y nunca
 * se sirve un PDF desactualizado. El PDF no depende de quién lo pide.
 */
export function pdfCacheKey(
  documentId: string,
  input: DocumentPdfInput,
  cover: boolean | undefined,
): string {
  const hash = createHash('sha1')
  for (const [field, value] of Object.entries(input)) {
    hash.update(field)
    hash.update('\0')
    hash.update(
      typeof value === 'string' ? value : JSON.stringify(value ?? null),
    )
    hash.update('\0')
  }
  return `${documentId}:${cover === undefined ? 'auto' : cover ? 1 : 0}:${hash.digest('hex')}`
}

/**
 * PDF del documento, desde la caché si ya se generó igual hace poco. Quien llama debe haber comprobado ya
 * la autorización (el `input` sale de una lectura con RLS o de un enlace válido): la caché no autoriza nada.
 */
export async function renderDocumentPdfCached(
  documentId: string,
  input: DocumentPdfInput,
  options: { cover?: boolean } = {},
  render: (
    input: DocumentPdfInput,
    options: { cover?: boolean },
  ) => Promise<Buffer> = renderDocumentPdf,
): Promise<Buffer> {
  const key = pdfCacheKey(documentId, input, options.cover)
  const cached = pdfCache.get(key)
  if (cached) return cached
  const pending = inflight.get(key)
  if (pending) return pending
  const generation = render(input, options)
    .then((pdf) => {
      pdfCache.set(key, pdf)
      return pdf
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, generation)
  return generation
}

/** Vacía la caché (pruebas). */
export function clearPdfCache() {
  pdfCache.clear()
  inflight.clear()
}
