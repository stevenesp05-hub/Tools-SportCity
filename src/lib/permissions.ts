/**
 * Roles de Sport City Tools:
 * - admin: todo.
 * - recepcion: trabaja con los documentos (crea, edita, comparte, pide revisión, comenta) pero no
 *   aprueba, elimina, gestiona plantillas, accesos ni usuarios.
 * - profesor: solo lectura, y únicamente de las carpetas donde se le da acceso de forma expresa.
 */
export const ROLES = ['admin', 'recepcion', 'profesor'] as const

export type Role = (typeof ROLES)[number]

/** Roles antiguos que aún pueden venir de la base de datos hasta ejecutar la migración 0021. */
const LEGACY_ROLES: Record<string, Role> = {
  gestor_general: 'recepcion',
  usuario: 'profesor',
}

/** Convierte lo que llegue de la base de datos en un rol válido; lo desconocido pierde todo acceso salvo lectura restringida. */
export function normalizeRole(value: unknown): Role {
  if ((ROLES as ReadonlyArray<unknown>).includes(value)) return value as Role
  return LEGACY_ROLES[String(value)] ?? 'profesor'
}

/** Quienes ven una carpeta o documento sin restricción expresa (`visible_roles` nulo). El profesor nunca entra aquí. */
export const STAFF_ROLES: ReadonlyArray<Role> = ['admin', 'recepcion']

/** Roles que ven algo según su `visible_roles` (nulo = personal). Admin lo ve siempre. */
export function effectiveVisibleRoles(
  visibleRoles: ReadonlyArray<Role> | null | undefined,
): Role[] {
  const list = visibleRoles ?? STAFF_ROLES
  return ROLES.filter((r) => r === 'admin' || list.includes(r))
}

/** Guarda solo lo necesario: la audiencia por defecto (admin + recepción) se guarda como nulo. */
export function toVisibleRoles(roles: ReadonlyArray<Role>): Role[] | null {
  const set = new Set<Role>(['admin', ...roles])
  const isDefault =
    set.size === STAFF_ROLES.length && STAFF_ROLES.every((r) => set.has(r))
  return isDefault ? null : ROLES.filter((r) => set.has(r))
}

export const PERMISSIONS = {
  'tools.documentos.ver': ROLES,
  'tools.documentos.crear': ['admin', 'recepcion'],
  'tools.documentos.editar': ['admin', 'recepcion'],
  'tools.documentos.eliminar': ['admin'],
  'tools.documentos.aprobar': ['admin'],
  'tools.documentos.comentar': ['admin', 'recepcion'],
  'tools.documentos.plantillas': ['admin'],
  'tools.admin.gestionar_acceso': ['admin'],
  'tools.admin.ver_auditoria': ['admin'],
  'tools.admin.gestionar_usuarios': ['admin'],
} as const satisfies Record<string, ReadonlyArray<Role>>

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(
  role: Role | null | undefined,
  permission: Permission,
): boolean {
  if (!role) return false
  return (PERMISSIONS[permission] as ReadonlyArray<Role>).includes(role)
}

export function assertPermission(
  role: Role | null | undefined,
  permission: Permission,
): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`No autorizado: falta el permiso "${permission}"`)
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  recepcion: 'Recepción',
  profesor: 'Profesor',
}
