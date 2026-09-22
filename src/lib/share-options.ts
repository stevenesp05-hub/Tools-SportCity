/** Datos de autoría de un documento exportado. */
type Authorship = {
  authorName: string | null
  approvedBy: string | null
  approvedAt: string | null
}

/** Copia del documento sin autor, aprobador ni fecha de aprobación (enlaces compartidos «sin autoría»). */
export function withoutAuthorship<T extends Authorship>(input: T): T {
  return { ...input, authorName: null, approvedBy: null, approvedAt: null }
}
