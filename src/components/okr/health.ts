import { HEALTH_LABEL } from '#/lib/okr'
import type { Health } from '#/lib/okr'

/** Colores de cada estado, con los tokens de la marca (suave para fondos, sólido para barras). */
export const HEALTH_TONE: Record<
  Health,
  { label: string; badge: string; bar: string }
> = {
  completado: {
    label: HEALTH_LABEL.completado,
    badge: 'bg-info-soft text-info',
    bar: 'bg-info-solid',
  },
  en_ritmo: {
    label: HEALTH_LABEL.en_ritmo,
    badge: 'bg-success-soft text-success',
    bar: 'bg-success-solid',
  },
  en_riesgo: {
    label: HEALTH_LABEL.en_riesgo,
    badge: 'bg-warning-soft text-warning',
    bar: 'bg-warning-solid',
  },
  atrasado: {
    label: HEALTH_LABEL.atrasado,
    badge: 'bg-danger-soft text-destructive',
    bar: 'bg-destructive',
  },
}
