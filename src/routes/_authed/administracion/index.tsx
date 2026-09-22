import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { HardDrive, LayoutTemplate, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  cleanUnusedImages,
  createUserAccount,
  deleteUserAccount,
  listUsers,
  updateUserRole,
} from '#/server/admin'
import { installBaseTemplates } from '#/server/templates'
import { clearTemplatePreviewCache } from '#/components/documents/template-previews'
import { hasPermission, ROLES, ROLE_LABELS } from '#/lib/permissions'
import type { Role } from '#/lib/permissions'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { useDialogs } from '#/components/ui/dialogs'
import { ChoiceSelect } from '#/components/ui/choice-select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

export const Route = createFileRoute('/_authed/administracion/')({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.user?.role, 'tools.admin.gestionar_usuarios')) {
      throw redirect({ to: '/documentos' })
    }
  },
  loader: () => listUsers(),
  component: AdministracionPage,
})

const ROLE_OPTIONS = ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}))

function AdministracionPage() {
  const users = Route.useLoaderData()
  const { user: currentUser } = Route.useRouteContext()
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [form, setForm] = useState({
    email: '',
    fullName: '',
    password: '',
    role: 'recepcion' as Role,
  })
  const [creating, setCreating] = useState(false)
  const { confirm } = useDialogs()
  const [cleaning, setCleaning] = useState(false)

  async function handleCreateUser() {
    setCreating(true)
    try {
      await createUserAccount({
        data: {
          email: form.email,
          password: form.password,
          fullName: form.fullName || undefined,
          role: form.role,
        },
      })
      toast.success('Usuario creado')
      setInviteOpen(false)
      setForm({ email: '', fullName: '', password: '', role: 'recepcion' })
      await router.invalidate()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo crear el usuario',
      )
    } finally {
      setCreating(false)
    }
  }

  async function handleCleanImages() {
    setCleaning(true)
    try {
      const scan = await cleanUnusedImages({ data: { apply: false } })
      if (scan.unused === 0) {
        toast.success(
          `No hay imágenes sin uso (${scan.total} en total). Todo en orden.`,
        )
        return
      }
      const mb = (scan.unusedBytes / (1024 * 1024)).toFixed(1)
      const ok = await confirm({
        title: `¿Borrar ${scan.unused} imágenes sin uso?`,
        description: `Ocupan unos ${mb} MB y ningún documento, versión ni plantilla las usa. Esta acción no se puede deshacer.`,
        confirmLabel: 'Borrar imágenes',
        destructive: true,
      })
      if (!ok) return
      const done = await cleanUnusedImages({ data: { apply: true } })
      toast.success(`${done.removed} imágenes borradas (${mb} MB liberados)`)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'No se pudo limpiar el almacenamiento',
      )
    } finally {
      setCleaning(false)
    }
  }

  async function handleInstallTemplates() {
    try {
      const { installed, updated, removed, skipped } =
        await installBaseTemplates()
      clearTemplatePreviewCache()
      toast.success(
        `${installed} plantillas nuevas, ${updated} actualizadas` +
          (removed > 0 ? ` y ${removed} duplicadas eliminadas` : ''),
      )
      if (skipped > 0)
        toast.warning(
          `${skipped} plantillas existentes no se pudieron actualizar: ejecuta la migración 0012_plantillas_actualizar.sql en Supabase y vuelve a pulsar el botón.`,
          { duration: 12000 },
        )
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'No se pudieron instalar las plantillas',
      )
    }
  }

  async function handleRoleChange(userId: string, role: Role) {
    try {
      await updateUserRole({ data: { userId, role } })
      await router.invalidate()
      toast.success('Rol actualizado')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo actualizar el rol',
      )
    }
  }

  async function handleDeleteUser(u: (typeof users)[number]) {
    const ok = await confirm({
      title: `¿Eliminar a ${u.full_name ?? u.email}?`,
      description:
        'Perderá el acceso a Sport City Tools. Sus comentarios, revisiones y enlaces compartidos se borrarán; el resto de su trabajo se conserva sin autor. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar usuario',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteUserAccount({ data: { userId: u.id } })
      await router.invalidate()
      toast.success('Usuario eliminado')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo eliminar el usuario',
      )
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-xl font-display text-foreground">
            Administración
          </h1>
          <p className="text-sm text-muted-foreground">
            Usuarios y roles de Sport City Tools.
          </p>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" />
          Crear usuario
        </Button>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Correo</Label>
              <Input
                id="new-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Nombre (opcional)</Label>
              <Input
                id="new-name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Contraseña temporal</Label>
              <Input
                id="new-password"
                type="text"
                autoComplete="off"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo 8 caracteres. Compártela con la persona por un canal
                seguro.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role">Rol</Label>
              <ChoiceSelect<Role>
                ariaLabel="Rol"
                className="h-9 w-full text-sm"
                value={form.role}
                onChange={(role) => setForm({ ...form, role })}
                options={ROLE_OPTIONS}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreateUser}
              disabled={creating || !form.email || form.password.length < 8}
            >
              Crear usuario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="mb-8 flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <LayoutTemplate className="size-4 text-primary" />
            Plantillas base de Sport City
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manual, reglamento, alcance, propuesta, presupuesto, solicitud de
            pago, ficha de puesto, política, procedimiento, acta e informe. Solo
            se añaden las que falten.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="flex-none"
          onClick={handleInstallTemplates}
        >
          Instalar plantillas
        </Button>
      </section>

      <section className="mb-8 flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <HardDrive className="size-4 text-primary" />
            Almacenamiento de imágenes
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Busca imágenes que ya no usa ningún documento (por ejemplo, de
            documentos borrados) y las elimina para liberar espacio. Antes de
            borrar te dice cuántas son.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="flex-none"
          disabled={cleaning}
          onClick={handleCleanImages}
        >
          {cleaning ? 'Revisando…' : 'Buscar imágenes sin uso'}
        </Button>
      </section>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-4 py-2.5 text-left text-2xs font-display uppercase tracking-wide text-muted-foreground">
                Usuario
              </th>
              <th className="px-4 py-2.5 text-left text-2xs font-display uppercase tracking-wide text-muted-foreground">
                Rol
              </th>
              <th className="px-4 py-2.5 text-left text-2xs font-display uppercase tracking-wide text-muted-foreground">
                Desde
              </th>
              <th className="w-12 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-foreground">
                    {u.full_name ?? u.email}
                  </div>
                  {u.full_name && (
                    <div className="text-xs text-muted-foreground">
                      {u.email}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {u.id === currentUser?.id ? (
                    <span className="text-muted-foreground">
                      {ROLE_LABELS[u.role]} (tú)
                    </span>
                  ) : (
                    <ChoiceSelect<Role>
                      ariaLabel="Cambiar rol"
                      className="w-44"
                      value={u.role}
                      onChange={(role) => void handleRoleChange(u.id, role)}
                      options={ROLE_OPTIONS}
                    />
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString('es-NI')}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {u.id !== currentUser?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar a ${u.full_name ?? u.email}`}
                      title="Eliminar usuario"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void handleDeleteUser(u)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
