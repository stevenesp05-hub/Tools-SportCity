import { createLruCache } from '#/lib/lru-cache'
import type { SupabaseServerClient } from '#/lib/supabase/server'

const LEGACY_EXTENSIONS = ['png', 'jpg', 'webp', 'gif']

// Los nombres son UUID que nunca se sobrescriben (se suben sin upsert): guardar el archivo en memoria es seguro.
// Solo se guardan aciertos; un "no existe" se vuelve a consultar porque la imagen puede subirse justo después.
const imageCache = createLruCache<Blob>({
  maxEntries: 100,
  maxBytes: 30 * 1024 * 1024,
  ttlMs: 10 * 60_000,
  sizeOf: (blob) => blob.size,
})
// Descargas en curso: dos peticiones simultáneas por la misma imagen comparten una sola.
const inflight = new Map<string, Promise<Blob | null>>()

async function fetchImage(
  supabase: Pick<SupabaseServerClient, 'storage'>,
  name: string,
) {
  const candidates = /\.[A-Za-z0-9]+$/.test(name)
    ? [name]
    : [name, ...LEGACY_EXTENSIONS.map((ext) => `${name}.${ext}`)]
  for (const candidate of candidates) {
    const { data } = await supabase.storage
      .from('documentos')
      .download(candidate)
    if (data) return data
  }
  return null
}

/**
 * Descarga una imagen del almacenamiento. Las imágenes nuevas se guardan sin extensión; las antiguas
 * (con .png, .jpg…) se encuentran probando las extensiones habituales.
 * Cualquier usuario con sesión puede leer el bucket (política "leer logueados"), así que la caché es común a todos;
 * cada ruta comprueba antes que quien pide puede ver el documento o el enlace.
 */
export async function downloadImage(
  supabase: Pick<SupabaseServerClient, 'storage'>,
  name: string,
) {
  const cached = imageCache.get(name)
  if (cached) return cached
  const pending = inflight.get(name)
  if (pending) return pending
  const request = fetchImage(supabase, name)
    .then((blob) => {
      if (blob) imageCache.set(name, blob)
      return blob
    })
    .finally(() => inflight.delete(name))
  inflight.set(name, request)
  return request
}

/** Ejecuta `work` sobre cada elemento con como mucho `limit` a la vez; el resultado conserva el orden. */
export async function mapWithConcurrency<T, TResult>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await work(items[index], index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}

const INTERNAL_IMAGE = /src="\/api\/imagenes\/([A-Za-z0-9._-]+)"/g

/**
 * Sustituye `src="/api/imagenes/<nombre>"` por lo que devuelva `resolve(nombre)` (p. ej. un data URI).
 * Cada nombre distinto se resuelve una sola vez (5 a la vez) y el HTML se recorre en una única pasada,
 * en vez de un `replace` por imagen sobre una cadena que ya lleva megabytes de base64.
 */
export async function inlineInternalImages(
  html: string,
  resolve: (name: string) => Promise<string | null>,
): Promise<string> {
  const names = [
    ...new Set(Array.from(html.matchAll(INTERNAL_IMAGE), (m) => m[1])),
  ]
  if (names.length === 0) return html
  const resolved = new Map<string, string>()
  await mapWithConcurrency(names, 5, async (name) => {
    const uri = await resolve(name)
    if (uri) resolved.set(name, uri)
  })
  return html.replace(INTERNAL_IMAGE, (whole, name: string) => {
    const uri = resolved.get(name)
    return uri ? `src="${uri}"` : whole
  })
}

/** Comprueba la firma real del archivo (no solo el tipo que declara el navegador): PNG, JPEG, GIF o WEBP. */
export function hasImageSignature(bytes: Uint8Array): boolean {
  const at = (i: number) => bytes[i] as number | undefined
  const png =
    at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47
  const jpeg = at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff
  const gif =
    at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38
  const webp =
    at(0) === 0x52 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x46 &&
    at(8) === 0x57 &&
    at(9) === 0x45 &&
    at(10) === 0x42 &&
    at(11) === 0x50
  return png || jpeg || gif || webp
}
