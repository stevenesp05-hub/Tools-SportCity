import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { getGestion } from '#/server/gestion'
import { hasPermission } from '#/lib/permissions'

/**
 * Gestión estratégica: OKR, KPI, estrategias, plan de acción, presupuesto y ROI. Todo se carga junto
 * aquí para que las secciones se alimenten unas de otras (el avance de las actividades mueve el de las
 * estrategias, el presupuesto alimenta el ROI…) y cambiar de sección sea instantáneo.
 */
export const Route = createFileRoute('/_authed/gestion')({
  validateSearch: z.object({
    anio: z.coerce.number().int().min(2000).max(2100).optional(),
    periodo: z.string().optional(),
  }),
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.user?.role, 'tools.okr.ver'))
      throw redirect({ to: '/documentos' })
  },
  loaderDeps: ({ search }) => ({ anio: search.anio, periodo: search.periodo }),
  loader: ({ deps }) =>
    getGestion({ data: { anio: deps.anio, periodo: deps.periodo } }),
  component: () => <Outlet />,
})
