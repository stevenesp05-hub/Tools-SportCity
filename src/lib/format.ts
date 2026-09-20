/** Fecha relativa en español: "hace 5 min", "ayer", "hace 3 días"; pasada una semana, la fecha corta. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime()
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'ahora mismo'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`
  const days = Math.round(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return new Date(iso).toLocaleDateString('es-NI', {
    day: 'numeric',
    month: 'short',
    year:
      new Date(iso).getFullYear() === new Date(now).getFullYear()
        ? undefined
        : 'numeric',
  })
}

/** Iniciales para el avatar de una persona: "Ana López" → "AL". */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '?').split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}
