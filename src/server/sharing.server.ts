import { getSupabaseAdminClient } from '#/lib/supabase/admin.server'

/** Resuelve un enlace público: documento y caducidad, o null si no existe, caducó o se revocó. */
async function resolveShare(
  token: string,
): Promise<{ documentId: string; expiresAt: number | null } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const admin = getSupabaseAdminClient()
  const { data } = await admin
    .from('document_shares')
    .select('document_id, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle()
  if (!data || data.revoked_at) return null
  const expiresAt = data.expires_at
    ? new Date(data.expires_at as string).getTime()
    : null
  if (expiresAt !== null && expiresAt < Date.now()) return null
  return { documentId: data.document_id as string, expiresAt }
}

/** Resuelve un enlace público. Devuelve el id del documento, o null si no existe, caducó o se revocó. */
export async function resolveShareToken(token: string) {
  return (await resolveShare(token))?.documentId ?? null
}

// ---------- Acceso a las imágenes de un documento compartido (con caché) ----------

/** Qué puede servir un enlace público: el documento, su versión actual y los ids de imagen que usa. */
export type ShareImageAccess = {
  documentId: string
  versionId: string
  /** Fin de vigencia del enlace (ms) o null si no caduca: se comprueba en cada petición aunque la entrada siga en caché. */
  expiresAt: number | null
  /** Ids de imagen (sin extensión) que aparecen en el HTML de la versión actual. */
  imageIds: ReadonlySet<string>
}

const SHARE_CACHE_TTL_MS = 60_000
const SHARE_CACHE_MAX = 200
const shareCache = new Map<
  string,
  { expiresAt: number; value: ShareImageAccess }
>()

/** Vacía la caché de enlaces (se llama al revocar uno para que deje de servir cuanto antes). */
export function clearShareCache() {
  shareCache.clear()
}

/**
 * Resuelve el enlace y devuelve el documento, su versión actual y las imágenes válidas, o null si el
 * enlace no existe, caducó, se revocó o el documento está en la papelera. El resultado positivo se
 * guarda 60 s por token en memoria, así que abrir un documento con muchas imágenes hace una sola
 * lectura en vez de una por imagen. Los fallos no se cachean.
 *
 * Uso: `const access = await getShareImageAccess(token)`; la imagen `path` es válida si el enlace no ha
 * caducado (`access.expiresAt`) y `access.imageIds.has(path.replace(/\.[A-Za-z0-9]+$/, ''))`.
 */
export async function getShareImageAccess(
  token: string,
): Promise<ShareImageAccess | null> {
  const now = Date.now()
  const cached = shareCache.get(token)
  if (cached && cached.expiresAt > now) return cached.value
  shareCache.delete(token)

  const share = await resolveShare(token)
  if (!share) return null
  const { documentId, expiresAt } = share

  const { data: doc } = await getSupabaseAdminClient()
    .from('documents')
    .select(
      'deleted_at, current_version_id, version:document_versions!documents_current_version_id_fkey(content_html)',
    )
    .eq('id', documentId)
    .maybeSingle()
  const raw = doc as unknown as {
    deleted_at: string | null
    current_version_id: string | null
    version: { content_html: string } | Array<{ content_html: string }> | null
  } | null
  const version = Array.isArray(raw?.version) ? raw.version[0] : raw?.version
  if (!raw || raw.deleted_at || !raw.current_version_id || !version) return null

  const imageIds = new Set<string>()
  // Las imágenes antiguas terminan en .png/.jpg…: se guarda el nombre sin extensión.
  for (const m of version.content_html.matchAll(
    /\/api\/imagenes\/([A-Za-z0-9._-]+)/g,
  ))
    imageIds.add(m[1].replace(/\.[A-Za-z0-9]+$/, ''))

  const value: ShareImageAccess = {
    documentId,
    versionId: raw.current_version_id,
    expiresAt,
    imageIds,
  }
  if (shareCache.size >= SHARE_CACHE_MAX)
    shareCache.delete(shareCache.keys().next().value as string)
  shareCache.set(token, { expiresAt: now + SHARE_CACHE_TTL_MS, value })
  return value
}
