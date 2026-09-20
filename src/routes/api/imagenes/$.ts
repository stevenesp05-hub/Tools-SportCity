import { createFileRoute } from '@tanstack/react-router'
import { apiAuthMiddleware } from '#/server/auth'
import { downloadImage } from '#/server/images.server'

export const Route = createFileRoute('/api/imagenes/$')({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ params, context }) => {
        const path = params._splat ?? ''
        if (!/^[A-Za-z0-9._-]+$/.test(path)) {
          return new Response('No encontrada', { status: 404 })
        }
        const data = await downloadImage(context.supabase, path)
        if (!data) {
          return new Response('No encontrada', { status: 404 })
        }
        return new Response(await data.arrayBuffer(), {
          headers: {
            'Content-Type': data.type || 'application/octet-stream',
            // Los nombres son UUID que se suben sin sobrescribir (uploadImage: randomUUID, sin upsert): inmutables.
            'Cache-Control': 'private, max-age=31536000, immutable',
          },
        })
      },
    },
  },
})
