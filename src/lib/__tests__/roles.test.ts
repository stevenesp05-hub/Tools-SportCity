import { describe, expect, it } from 'vitest'
import {
  PERMISSIONS,
  autoApproves,
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
  it('hay cuatro roles con etiqueta', () => {
    expect([...ROLES]).toEqual([
      'admin',
      'recepcion',
      'comite_arbitral',
      'profesor',
    ])
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLES].sort())
  })

  it('admin puede todo', () => {
    expect(can('admin').sort()).toEqual(Object.keys(PERMISSIONS).sort())
  })

  it('recepción trabaja los documentos, pero no aprueba, elimina ni administra', () => {
    expect(can('recepcion').sort()).toEqual(
      [
        'tools.documentos.ver',
        'tools.documentos.crear',
        'tools.documentos.editar',
        'tools.documentos.comentar',
        'tools.okr.ver',
        'tools.okr.registrar',
      ].sort(),
    )
  })

  it('comité arbitral redacta comunicados, pero no ve la gestión ni aprueba, elimina o administra', () => {
    expect(can('comite_arbitral').sort()).toEqual(
      [
        'tools.documentos.ver',
        'tools.documentos.crear',
        'tools.documentos.editar',
      ].sort(),
    )
    for (const p of [
      'tools.okr.ver',
      'tools.okr.registrar',
      'tools.okr.gestionar',
      'tools.documentos.aprobar',
      'tools.documentos.eliminar',
    ] as const)
      expect(hasPermission('comite_arbitral', p)).toBe(false)
  })

  it('solo el comité arbitral tiene la aprobación directa', () => {
    expect(autoApproves('comite_arbitral')).toBe(true)
    expect(autoApproves('admin')).toBe(false)
    expect(autoApproves('recepcion')).toBe(false)
    expect(autoApproves('profesor')).toBe(false)
    expect(autoApproves(null)).toBe(false)
  })

  it('profesor solo puede ver', () => {
    expect(can('profesor')).toEqual(['tools.documentos.ver'])
    expect(can('profesor')).not.toContain('tools.okr.ver')
  })

  it('los roles antiguos se traducen y lo desconocido queda como profesor', () => {
    expect(normalizeRole('gestor_general')).toBe('recepcion')
    expect(normalizeRole('usuario')).toBe('profesor')
    expect(normalizeRole('admin')).toBe('admin')
    expect(normalizeRole('comite_arbitral')).toBe('comite_arbitral')
    expect(normalizeRole('inventado')).toBe('profesor')
    expect(normalizeRole(null)).toBe('profesor')
  })
})

describe('roles: visibilidad', () => {
  it('sin restricción la ven admin y recepción, nunca el profesor', () => {
    expect(effectiveVisibleRoles(null)).toEqual(['admin', 'recepcion'])
  })

  it('el comité arbitral solo ve lo que lo nombra', () => {
    expect(effectiveVisibleRoles(null)).not.toContain('comite_arbitral')
    expect(effectiveVisibleRoles(['recepcion'])).not.toContain(
      'comite_arbitral',
    )
    expect(effectiveVisibleRoles(['comite_arbitral'])).toEqual([
      'admin',
      'comite_arbitral',
    ])
    expect(toVisibleRoles(['recepcion', 'comite_arbitral'])).toEqual([
      'admin',
      'recepcion',
      'comite_arbitral',
    ])
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
