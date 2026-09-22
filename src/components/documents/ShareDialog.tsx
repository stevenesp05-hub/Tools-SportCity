import { memo, useCallback, useEffect, useState } from 'react'
import { Copy, Link2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { createShare, listShares, revokeShare } from '#/server/sharing'
import type { ShareLink } from '#/server/sharing'
import { Button } from '#/components/ui/button'
import { ChoiceSelect } from '#/components/ui/choice-select'
import { Checkbox } from '#/components/ui/checkbox'
import { Label } from '#/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { cn } from '#/lib/utils'

const EXPIRY = [
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: 'never', label: 'Sin caducidad' },
] as const

const shareUrl = (token: string) =>
  `${window.location.origin}/compartido/${token}`

export const ShareDialog = memo(function ShareDialog({
  documentId,
  open,
  onOpenChange,
  canHideAuthorship = false,
}: {
  documentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Solo el administrador puede ocultar autor y aprobador en lo compartido. */
  canHideAuthorship?: boolean
}) {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [expiry, setExpiry] = useState<string>('30')
  const [busy, setBusy] = useState(false)
  const [hideAuthorship, setHideAuthorship] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setLinks(await listShares({ data: { documentId } }))
    } catch {
      setLinks([])
    }
  }, [documentId])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(token))
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar. Selecciona el enlace y cópialo a mano.')
    }
  }

  async function create() {
    setBusy(true)
    try {
      const { token } = await createShare({
        data: {
          documentId,
          days: expiry === 'never' ? null : Number(expiry),
          ...(canHideAuthorship && hideAuthorship
            ? { hideAuthorship: true }
            : {}),
        },
      })
      await refresh()
      await copy(token)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo crear el enlace',
      )
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    try {
      await revokeShare({ data: { id } })
      await refresh()
      toast.success('Enlace desactivado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desactivar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Compartir con enlace de solo lectura</DialogTitle>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning">
          <ShieldAlert className="mt-0.5 size-4 flex-none" />
          <span>
            Cualquiera que tenga el enlace podrá leer y descargar en PDF esta
            versión del documento, sin iniciar sesión. Compártelo solo con quien
            deba verlo y desactívalo cuando ya no haga falta.
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Caduca en</Label>
            <ChoiceSelect
              ariaLabel="Caducidad del enlace"
              className="h-9 w-44 text-sm"
              value={expiry}
              onChange={setExpiry}
              options={EXPIRY.map((e) => ({ value: e.value, label: e.label }))}
            />
          </div>
          <Button onClick={create} disabled={busy}>
            <Link2 className="size-4" />
            Crear y copiar enlace
          </Button>
        </div>
        {canHideAuthorship && (
          <label className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              className="mt-0.5"
              checked={hideAuthorship}
              onCheckedChange={(v) => setHideAuthorship(v === true)}
            />
            <span>
              Ocultar autor y aprobador
              <span className="block text-xs text-muted-foreground">
                El PDF que descargue quien reciba el enlace saldrá sin nombres:
                ni quién lo escribió ni quién lo aprobó.
              </span>
            </span>
          </label>
        )}

        {links.length > 0 && (
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {links.map((link) => (
              <li
                key={link.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2',
                  !link.active && 'opacity-60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs text-foreground">
                    {`${window.location.origin}/compartido/${link.token}`}
                  </div>
                  <div className="text-2xs text-muted-foreground">
                    {link.revokedAt
                      ? 'Desactivado'
                      : link.active
                        ? link.expiresAt
                          ? `Caduca el ${new Date(link.expiresAt).toLocaleDateString('es-NI')}`
                          : 'Sin caducidad'
                        : 'Caducado'}
                    {link.hideAuthorship && ' · Sin autor ni aprobador'}
                  </div>
                </div>
                {link.active && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => copy(link.token)}
                    >
                      <Copy className="size-3.5" />
                      Copiar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-destructive hover:text-destructive"
                      onClick={() => revoke(link.id)}
                    >
                      Desactivar
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
})
