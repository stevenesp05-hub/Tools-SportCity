import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, forgetCachedProfile } from '#/server/auth'
import { assertPermission, normalizeRole, ROLES } from '#/lib/permissions'
import { getSupabaseAdminClient } from '#/lib/supabase/admin.server'

export type UserRow = {
  id: string
  email: string
  full_name: string | null
  role: (typeof ROLES)[number]
  created_at: string
}

export const listUsers = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<UserRow[]> => {
    assertPermission(context.user.role, 'tools.admin.gestionar_usuarios')
    const { data, error } = await context.supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .order('created_at')
    if (error) throw new Error(error.message)
    // Hasta ejecutar la migración 0021 pueden quedar cuentas con los roles antiguos.
    return data.map((u) => ({ ...u, role: normalizeRole(u.role) }))
  })

export const updateUserRole = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string().min(1), role: z.enum(ROLES) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.admin.gestionar_usuarios')
    if (data.userId === context.user.id) {
      throw new Error('No puedes cambiar tu propio rol.')
    }
    const { error } = await context.supabase
      .from('profiles')
      .update({ role: data.role })
      .eq('id', data.userId)
    if (error) throw new Error(error.message)
    forgetCachedProfile(data.userId)
    return { ok: true as const }
  })

export const createUserAccount = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      email: z.string().trim().email(),
      password: z.string().min(8).max(72),
      fullName: z.string().trim().max(120).optional(),
      role: z.enum(ROLES),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.admin.gestionar_usuarios')

    const admin = getSupabaseAdminClient()
    const { data: created, error } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    })
    if (error) throw new Error(error.message)

    // El trigger crea el perfil con el rol por defecto; se ajusta aquí el rol y el nombre.
    const { error: profileError } = await admin
      .from('profiles')
      .update({ role: data.role, full_name: data.fullName ?? null })
      .eq('id', created.user.id)
    if (profileError) throw new Error(profileError.message)

    return { ok: true as const }
  })

export const deleteUserAccount = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.admin.gestionar_usuarios')
    if (data.userId === context.user.id) {
      throw new Error('No puedes eliminar tu propia cuenta.')
    }

    // Borrar en Auth arrastra el perfil (on delete cascade); la migración 0015
    // deja el resto de claves foráneas en set null / cascade.
    const admin = getSupabaseAdminClient()
    const { error } = await admin.auth.admin.deleteUser(data.userId)
    if (error) throw new Error(error.message)
    forgetCachedProfile(data.userId)
    return { ok: true as const }
  })

const GRACE_MS = 24 * 60 * 60 * 1000

export type ImageCleanup = {
  total: number
  unused: number
  unusedBytes: number
  removed: number
}

/**
 * Busca (y opcionalmente borra) imágenes del almacenamiento que ninguna versión de ningún documento
 * ni plantilla usa. Se respetan las subidas de las últimas 24 horas, por si se está editando.
 */
export const cleanUnusedImages = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ apply: z.boolean() }))
  .handler(async ({ context, data }): Promise<ImageCleanup> => {
    assertPermission(context.user.role, 'tools.admin.gestionar_usuarios')
    const admin = getSupabaseAdminClient()

    const referenced = new Set<string>()
    const collect = (html: string) => {
      for (const m of html.matchAll(/\/api\/imagenes\/([A-Za-z0-9._-]+)/g))
        referenced.add(m[1])
    }
    // Recorrer las versiones/plantillas y listar el almacenamiento no dependen entre sí.
    const scanReferences = async () => {
      for (const table of [
        'document_versions',
        'document_templates',
      ] as const) {
        for (let from = 0; ; from += 200) {
          const { data: rows, error } = await admin
            .from(table)
            .select('content_html')
            .range(from, from + 199)
          if (error) throw new Error(error.message)
          for (const row of rows as Array<{ content_html: string }>)
            collect(row.content_html)
          if (rows.length < 200) break
        }
      }
    }

    const objects: Array<{ name: string; size: number; createdAt: number }> = []
    const listObjects = async () => {
      for (let offset = 0; ; offset += 100) {
        const { data: page, error } = await admin.storage
          .from('documentos')
          .list('', { limit: 100, offset })
        if (error) throw new Error(error.message)
        for (const item of page) {
          // Las carpetas del almacenamiento no traen id; solo interesan los archivos.
          if (!item.id) continue
          objects.push({
            name: item.name,
            size: Number(
              (item.metadata as { size?: number } | null)?.size ?? 0,
            ),
            createdAt: item.created_at
              ? new Date(item.created_at).getTime()
              : 0,
          })
        }
        if (page.length < 100) break
      }
    }
    await Promise.all([scanReferences(), listObjects()])

    const unused = objects.filter(
      (o) =>
        !referenced.has(o.name) &&
        !referenced.has(o.name.replace(/\.[A-Za-z0-9]+$/, '')) &&
        Date.now() - o.createdAt > GRACE_MS,
    )
    let removed = 0
    if (data.apply) {
      for (let i = 0; i < unused.length; i += 100) {
        const chunk = unused.slice(i, i + 100).map((o) => o.name)
        const { error } = await admin.storage.from('documentos').remove(chunk)
        if (error) throw new Error(error.message)
        removed += chunk.length
      }
    }
    return {
      total: objects.length,
      unused: unused.length,
      unusedBytes: unused.reduce((sum, o) => sum + o.size, 0),
      removed,
    }
  })
