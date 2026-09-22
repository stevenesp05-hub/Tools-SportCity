import { Link, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'

function Shell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <img src="/brand/logo-mark.png" alt="Sport City" className="h-12" />
      <h1 className="text-xl font-display text-foreground">{title}</h1>
      {children}
    </div>
  )
}

export function NotFoundPage() {
  return (
    <Shell title="No encontramos esta página">
      <p className="max-w-sm text-sm text-muted-foreground">
        Puede que el documento se haya movido, eliminado, o que no tengas
        permiso para verlo.
      </p>
      <Button asChild>
        <Link to="/documentos">Ir al inicio</Link>
      </Button>
    </Shell>
  )
}

export function ErrorPage({ error, info }: ErrorComponentProps) {
  const router = useRouter()
  // En desarrollo, además del mensaje, se muestra dónde falló para poder localizarlo sin abrir la consola.
  if (import.meta.env.DEV)
    console.error('[ErrorPage]', error, info?.componentStack)
  return (
    <Shell title="Algo ha salido mal">
      <p className="max-w-md text-sm text-muted-foreground">
        No se pudo cargar esta pantalla. Puedes reintentarlo; si sigue pasando,
        avisa a quien administra el sistema.
      </p>
      {import.meta.env.DEV && (
        <pre className="max-h-80 max-w-2xl overflow-auto whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-left text-xs text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
          {error instanceof Error && error.stack
            ? `\n\n${error.stack.split('\n').slice(1, 12).join('\n')}`
            : ''}
          {info?.componentStack
            ? `\n\nComponentes:${info.componentStack.split('\n').slice(0, 8).join('\n')}`
            : ''}
        </pre>
      )}
      <div className="flex gap-2">
        <Button onClick={() => void router.invalidate()}>Reintentar</Button>
        <Button variant="outline" asChild>
          <Link to="/documentos">Ir al inicio</Link>
        </Button>
      </div>
    </Shell>
  )
}

/** Esqueleto que se muestra mientras carga una pantalla (evita el salto en blanco). */
export function PendingPage() {
  return (
    <div className="animate-pulse space-y-5 px-6 py-8" aria-busy="true">
      <div className="h-7 w-56 rounded-md bg-secondary" />
      <div className="h-4 w-80 max-w-full rounded-md bg-secondary/70" />
      <div className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="h-44 rounded-xl border border-border bg-card"
          />
        ))}
      </div>
    </div>
  )
}
