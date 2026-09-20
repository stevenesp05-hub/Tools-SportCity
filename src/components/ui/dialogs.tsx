import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
}
type PromptOptions = {
  title: string
  label?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
}

type Pending =
  | {
      kind: 'confirm'
      options: ConfirmOptions
      resolve: (value: boolean) => void
    }
  | {
      kind: 'prompt'
      options: PromptOptions
      resolve: (value: string | null) => void
    }

type DialogsApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  prompt: (options: PromptOptions) => Promise<string | null>
}

const DialogsContext = createContext<DialogsApi | null>(null)

/** Sustituye a window.confirm / window.prompt por diálogos con el estilo de la aplicación. */
export function DialogsProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [text, setText] = useState('')

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) =>
        setPending({ kind: 'confirm', options, resolve }),
      ),
    [],
  )
  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setText(options.defaultValue ?? '')
        setPending({ kind: 'prompt', options, resolve })
      }),
    [],
  )
  const api = useMemo(() => ({ confirm, prompt }), [confirm, prompt])

  function close(result: boolean | string | null) {
    if (!pending) return
    if (pending.kind === 'confirm') pending.resolve(result === true)
    else pending.resolve(typeof result === 'string' ? result : null)
    setPending(null)
  }

  return (
    <DialogsContext.Provider value={api}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) =>
          !open && close(pending?.kind === 'confirm' ? false : null)
        }
      >
        <DialogContent className="max-w-md">
          {pending?.kind === 'confirm' && (
            <>
              <DialogHeader>
                <DialogTitle>{pending.options.title}</DialogTitle>
                {pending.options.description && (
                  <DialogDescription>
                    {pending.options.description}
                  </DialogDescription>
                )}
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => close(false)}>
                  Cancelar
                </Button>
                <Button
                  variant={
                    pending.options.destructive ? 'destructive' : 'default'
                  }
                  onClick={() => close(true)}
                  autoFocus
                >
                  {pending.options.confirmLabel ?? 'Confirmar'}
                </Button>
              </DialogFooter>
            </>
          )}
          {pending?.kind === 'prompt' && (
            <>
              <DialogHeader>
                <DialogTitle>{pending.options.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-1.5">
                {pending.options.label && (
                  <Label htmlFor="prompt-input">{pending.options.label}</Label>
                )}
                <Input
                  id="prompt-input"
                  autoFocus
                  value={text}
                  placeholder={pending.options.placeholder}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && text.trim() && close(text.trim())
                  }
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => close(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => close(text.trim())}
                  disabled={!text.trim()}
                >
                  {pending.options.confirmLabel ?? 'Aceptar'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DialogsContext.Provider>
  )
}

export function useDialogs(): DialogsApi {
  const api = useContext(DialogsContext)
  if (!api) throw new Error('useDialogs debe usarse dentro de DialogsProvider')
  return api
}
