import { getRouteApi, useNavigate, useRouter } from '@tanstack/react-router'
import { hasPermission } from '#/lib/permissions'

const api = getRouteApi('/_authed/gestion')

/** Datos de la gestión estratégica, permisos y cómo cambiar año/periodo o recargar. */
export function useGestion() {
  const data = api.useLoaderData()
  const { user } = api.useRouteContext()
  const router = useRouter()
  const navigate = useNavigate()
  return {
    data,
    user,
    canManage: hasPermission(user?.role, 'tools.okr.gestionar'),
    canRegister: hasPermission(user?.role, 'tools.okr.registrar'),
    refresh: () => router.invalidate(),
    setYear: (anio: number) =>
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({ ...prev, anio }),
      }),
    setPeriod: (periodo: string) =>
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({ ...prev, periodo }),
      }),
  }
}
