import { describe, expect, it } from 'vitest'
import { withoutAuthorship } from '../share-options'
import { hasPermission } from '../permissions'

const input = {
  title: 'Resolución',
  authorName: 'Ana Pérez',
  approvedBy: 'Luis Gómez',
  approvedAt: '2026-09-20T10:00:00Z',
  status: 'vigente',
}

describe('enlaces compartidos sin autoría', () => {
  it('quita autor, aprobador y fecha de aprobación, y deja el resto', () => {
    const out = withoutAuthorship(input)
    expect(out.authorName).toBeNull()
    expect(out.approvedBy).toBeNull()
    expect(out.approvedAt).toBeNull()
    expect(out.title).toBe('Resolución')
    expect(out.status).toBe('vigente')
  })

  it('no modifica el original', () => {
    withoutAuthorship(input)
    expect(input.authorName).toBe('Ana Pérez')
  })

  it('solo el administrador puede pedirlo', () => {
    expect(hasPermission('admin', 'tools.admin.gestionar_acceso')).toBe(true)
    expect(hasPermission('recepcion', 'tools.admin.gestionar_acceso')).toBe(
      false,
    )
    expect(hasPermission('profesor', 'tools.admin.gestionar_acceso')).toBe(
      false,
    )
  })
})
