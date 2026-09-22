import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '#/server/auth'
import {
  DEFAULT_TEMPLATES,
  RETIRED_TEMPLATE_NAMES,
  buildTemplateContent,
} from '#/lib/default-templates'
import { sanitizeContentHtml } from '#/lib/sanitize.server'
import { assertPermission } from '#/lib/permissions'
import { mapLimit } from '#/lib/map-limit'

/** Carpetas raíz que el instalador crea si faltan (solo las añadidas después del arranque inicial). */
const AUTO_CREATE_SPACES = ['Inventarios']

/**
 * Instala las plantillas base de Sport City. Las que ya existen (por nombre) se actualizan
 * a la versión actual del catálogo; las nuevas se crean. No toca las plantillas propias
 * que tengan otro nombre.
 */
export const installBaseTemplates = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
    }): Promise<{
      installed: number
      updated: number
      removed: number
      skipped: number
    }> => {
      assertPermission(context.user.role, 'tools.documentos.plantillas')

      const [{ data: folders }, { data: current }] = await Promise.all([
        context.supabase
          .from('folders')
          .select('id, name, parent_id')
          .is('record_id', null),
        context.supabase
          .from('document_templates')
          .select('id, name')
          .order('created_at', { ascending: true }),
      ])

      // Se busca la carpeta por nombre en cualquier nivel; si hay varias, gana la más alta (raíz).
      const spaceId = new Map<string, string>()
      const all = (folders ?? []) as Array<{
        id: string
        name: string
        parent_id: string | null
      }>
      for (const f of [...all].sort(
        (a, b) => Number(a.parent_id !== null) - Number(b.parent_id !== null),
      )) {
        if (!spaceId.has(f.name)) spaceId.set(f.name, f.id)
      }
      // Espacios nuevos del catálogo que se crean solos si aún no existen (los que borres no se recrean).
      for (const space of AUTO_CREATE_SPACES) {
        if (spaceId.has(space)) continue
        const { data: created, error: createError } = await context.supabase
          .from('folders')
          .insert({ name: space, parent_id: null, created_by: context.user.id })
          .select('id')
          .single()
        if (createError) throw new Error(createError.message)
        spaceId.set(space, created.id as string)
      }

      // Si hay copias repetidas de una plantilla base (instalaciones antiguas), se conserva la más antigua.
      const baseNames = new Set(DEFAULT_TEMPLATES.map((t) => t.name))
      const existingByName = new Map<string, string>()
      const duplicateIds: string[] = []
      for (const t of (current ?? []) as Array<{ id: string; name: string }>) {
        if (!existingByName.has(t.name)) existingByName.set(t.name, t.id)
        else if (baseNames.has(t.name)) duplicateIds.push(t.id)
      }
      // Plantillas base con nombre antiguo: se retiran (la versión actual ya las sustituye).
      for (const t of (current ?? []) as Array<{ id: string; name: string }>)
        if (RETIRED_TEMPLATE_NAMES.includes(t.name)) duplicateIds.push(t.id)
      if (duplicateIds.length > 0) {
        const { error } = await context.supabase
          .from('document_templates')
          .delete()
          .in('id', duplicateIds)
        if (error) throw new Error(error.message)
      }

      // Cada plantilla es independiente de las demás: se procesan de 5 en 5 en vez de una a una.
      const outcomes = await mapLimit(
        DEFAULT_TEMPLATES,
        5,
        async (definition): Promise<'installed' | 'updated' | 'skipped'> => {
          const { content, contentHtml } = buildTemplateContent(definition)
          const row = {
            name: definition.name,
            description: definition.description,
            // Si la carpeta no existe, la plantilla queda disponible en todas.
            folder_id: definition.space
              ? (spaceId.get(definition.space) ?? null)
              : null,
            content,
            content_html: sanitizeContentHtml(contentHtml),
          }
          const existingId = existingByName.get(definition.name)
          if (existingId) {
            const { data: changed, error } = await context.supabase
              .from('document_templates')
              .update(row)
              .eq('id', existingId)
              .select('id')
            if (error) throw new Error(error.message)
            // Sin la política de actualización (migración 0012) Supabase no da error: simplemente no cambia nada.
            return changed.length === 0 ? 'skipped' : 'updated'
          }
          const { error } = await context.supabase
            .from('document_templates')
            .insert({ ...row, created_by: context.user.id })
          if (error) throw new Error(error.message)
          return 'installed'
        },
      )
      const count = (kind: 'installed' | 'updated' | 'skipped') =>
        outcomes.filter((o) => o === kind).length
      const installed = count('installed')
      const updated = count('updated')
      const skipped = count('skipped')

      return { installed, updated, removed: duplicateIds.length, skipped }
    },
  )
