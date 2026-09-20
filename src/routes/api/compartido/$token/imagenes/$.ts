import { createFileRoute } from '@tanstack/react-router'
import { getSupabaseAdminClient } from '#/lib/supabase/admin.server'
import { getShareImageAccess } from '#/server/sharing.server'
import { downloadImage } from '#/server/images.server'

const stripExtension = (name: string) => name.replace(/\.[A-Za-z0-9]+$/, '')

/** Imágenes de un documento compartido: solo se sirven las que el documento realmente usa. */
export const Route = createFileRoute('/api/compartido/$token/imagenes/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = params._splat ?? ''
        if (!/^[A-Za-z0-9._-]+$/.test(path))
          return new Response('No encontrada', { status: 404 })
        // La resolución del enlace y el HTML del documento se guardan 60 s (ver sharing.server.ts).
        const access = await getShareImageAccess(params.token)
        if (
          !access ||
          (access.expiresAt !== null && access.expiresAt < Date.now()) ||
          !access.imageIds.has(stripExtension(path))
        )
          return new Response('No encontrada', { status: 404 })

        const data = await downloadImage(getSupabaseAdminClient(), path)
        if (!data) return new Response('No encontrada', { status: 404 })
        return new Response(await data.arrayBuffer(), {
          headers: {
            'Content-Type': data.type || 'application/octet-stream',
            // Los nombres no cambian, pero el enlace puede revocarse: una hora, no un año.
            'Cache-Control': 'private, max-age=3600',
            'X-Robots-Tag': 'noindex',
          },
        })
      },
    },
  },
})
