import { describe, expect, it } from 'vitest'
import {
  PERMISSIONS,
  ROLES,
  ROLE_LABELS,
  effectiveVisibleRoles,
  hasPermission,
  normalizeRole,
  toVisibleRoles,
} from '../permissions'
import type { Permission, Role } from '../permissions'

const can = (role: Role) =>
  (Object.keys(PERMISSIONS) as Permission[]).filter((p) =>
    hasPermission(role, p),
  )

describe('roles: matriz de permisos', () => {
  it('hay tres roles con etiqueta', () => {
    expect([...ROLES]).toEqual(['admin', 'recepcion', 'profesor'])
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLES].sort())
  })

  it('admin puede todo', () => {
    expect(can('admin').sort()).toEqual(Object.keys(PERMISSIONS).sort())
  })

  it('recepción trabaja los documentos pero no aprueba, elimina ni administra', () => {
    expect(can('recepcion').sort()).toEqual(
      [
        'tools.documentos.ver',
        'tools.documentos.crear',
        'tools.documentos.editar',
        'tools.documentos.comentar',
      ].sort(),
    )
  })

  it('profesor solo puede ver', () => {
    expect(can('profesor')).toEqual(['tools.documentos.ver'])
  })

  it('los roles antiguos se traducen y lo desconocido queda como profesor', () => {
    expect(normalizeRole('gestor_general')).toBe('recepcion')
    expect(normalizeRole('usuario')).toBe('profesor')
    expect(normalizeRole('admin')).toBe('admin')
    expect(normalizeRole('inventado')).toBe('profesor')
    expect(normalizeRole(null)).toBe('profesor')
  })
})

describe('roles: visibilidad', () => {
  it('sin restricción la ven admin y recepción, nunca el profesor', () => {
    expect(effectiveVisibleRoles(null)).toEqual(['admin', 'recepcion'])
  })

  it('admin siempre está incluido', () => {
    expect(effectiveVisibleRoles(['profesor'])).toEqual(['admin', 'profesor'])
  })

  it('la audiencia por defecto se guarda como nulo; lo demás, explícito', () => {
    expect(toVisibleRoles(['admin', 'recepcion'])).toBeNull()
    expect(toVisibleRoles(['recepcion'])).toBeNull()
    expect(toVisibleRoles(['recepcion', 'profesor'])).toEqual([
      'admin',
      'recepcion',
      'profesor',
    ])
    expect(toVisibleRoles(['profesor'])).toEqual(['admin', 'profesor'])
  })
})
