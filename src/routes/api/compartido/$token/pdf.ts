import { createFileRoute } from '@tanstack/react-router'
import { attachment } from '#/lib/content-disposition'
import { getSupabaseAdminClient } from '#/lib/supabase/admin.server'
import { resolveShareToken } from '#/server/sharing.server'
import { loadDocumentForExport } from '#/server/export.server'
import { renderDocumentPdfCached } from '#/lib/pdf-cache.server'

// Límite sencillo por enlace y por IP: la generación de PDF es costosa y este endpoint es público.
// Vive en la memoria de la instancia (en serverless no se comparte entre instancias): frena ráfagas, no es un límite exacto.
const WINDOW_MS = 60_000
const MAX_HITS = 6
const MAX_HITS_PER_IP = 12
const MAX_KEYS = 5_000
const hits = new Map<string, number[]>()
let lastSweep = 0

/** Limpieza periódica: descarta las claves sin pulsaciones recientes para que el Map no crezca sin límite. */
function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS && hits.size < MAX_KEYS) return
  lastSweep = now
  for (const [key, times] of hits)
    if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key)
  // Si aun así hay demasiadas claves (barrido de IPs), se descarta lo más antiguo.
  while (hits.size >= MAX_KEYS) {
    const oldest = hits.keys().next()
    if (oldest.done) break
    hits.delete(oldest.value)
  }
}

function hit(key: string, max: number, now: number) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= max) return false
  hits.set(key, [...recent, now])
  return true
}

/** IP del cliente: en Vercel y tras proxies llega en x-forwarded-for (el primero es el cliente). */
function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')
  return (
    forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null
  )
}

function allowed(token: string, request: Request) {
  const now = Date.now()
  sweep(now)
  if (!hit(`t:${token}`, MAX_HITS, now)) return false
  // Y por IP (si el proxy la informa): una misma IP contra muchos enlaces distintos. Sin IP, solo cuenta el enlace.
  const ip = clientIp(request)
  return ip === null || hit(`ip:${ip}`, MAX_HITS_PER_IP, now)
}

export const Route = createFileRoute('/api/compartido/$token/pdf')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const documentId = await resolveShareToken(params.token)
        if (!documentId)
          return new Response('Enlace no disponible', { status: 404 })
        if (!allowed(params.token, request))
          return new Response('Demasiadas descargas. Espera un minuto.', {
            status: 429,
          })

        const input = await loadDocumentForExport(
          getSupabaseAdminClient(),
          documentId,
        )
        if (!input)
          return new Response('Documento no encontrado', { status: 404 })

        // El enlace ya se validó arriba; la caché solo evita regenerar el mismo PDF.
        const pdf = await renderDocumentPdfCached(documentId, input)
        return new Response(new Uint8Array(pdf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': attachment(input.title, 'pdf'),
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex',
          },
        })
      },
    },
  },
})
