import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '#/server/auth'
import { assertPermission } from '#/lib/permissions'

export type AuditEntry = {
  id: string
  action: string
  table_name: string
  record_id: string
  summary: string | null
  created_at: string
  actor: { full_name: string | null; email: string } | null
}

export const listAuditLog = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertPermission(context.user.role, 'tools.admin.ver_auditoria')
    const { data, error } = await context.supabase
      .from('audit_log')
      .select(
        'id, action, table_name, record_id, summary, created_at, actor:profiles(full_name, email)',
      )
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw new Error(error.message)
    return data as unknown as AuditEntry[]
  })
