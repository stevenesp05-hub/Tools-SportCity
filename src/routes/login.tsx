import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import {
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  TriangleAlert,
} from 'lucide-react'
import { login } from '#/server/auth'
import { clearCachedUser } from '#/lib/session-cache'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

function sanitizeRedirect(url: unknown): string {
  if (
    typeof url !== 'string' ||
    !url.startsWith('/') ||
    url.startsWith('//') ||
    url.includes('\\')
  ) {
    return '/documentos'
  }
  return url
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: sanitizeRedirect(search.redirect),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.user) {
      throw redirect({ to: search.redirect })
    }
  },
  component: LoginPage,
})

function BrandMark({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 text-white ${className}`}>
      <img
        src="/brand/logo-mark-white.png"
        alt=""
        className="h-10 w-10 object-contain"
      />
      <span className="flex flex-col leading-none">
        <span className="font-display text-xl font-bold tracking-tight">
          Sport City
        </span>
        <span className="mt-1 text-2xs font-medium uppercase tracking-[0.2em] text-white/70">
          Club · Tools
        </span>
      </span>
    </div>
  )
}

function LoginPage() {
  const router = useRouter()
  const search = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      await login({ data: { email: email.trim(), password } })
      clearCachedUser()
      await router.invalidate()
      await router.navigate({ to: search.redirect })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Correo o contraseña incorrectos.',
      )
      setPassword('')
      setLoading(false)
      setTimeout(() => passwordRef.current?.focus(), 0)
    }
  }

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState('CapsLock'))
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Panel de marca: solo en pantallas grandes */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex xl:p-16"
        style={{
          background:
            'linear-gradient(160deg, oklch(0.27 0.14 275) 0%, oklch(0.19 0.1 275) 55%, oklch(0.13 0.08 275) 100%)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.09]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)',
            backgroundSize: '26px 26px',
            maskImage:
              'linear-gradient(180deg, transparent 0%, #000 35%, #000 65%, transparent 100%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[78%] max-w-[36rem] -translate-x-1/2 -translate-y-1/2 opacity-[0.07]"
          style={{
            backgroundImage: 'url(/brand/logo-mark-white.png)',
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-52 -left-40 h-[34rem] w-[34rem] rounded-full opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, oklch(0.5 0.16 240 / 0.55) 0%, transparent 70%)',
          }}
        />

        <BrandMark className="relative" />

        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight xl:text-[2.6rem]">
            Gestión documental
            <span className="block text-[oklch(0.83_0.08_240)]">
              de Sport City
            </span>
          </h1>
          <div className="mt-6 h-1 w-12 rounded-full bg-[oklch(0.83_0.08_240)]" />
        </div>

        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} Sport City Club · Uso interno
        </p>
      </aside>

      {/* Formulario */}
      <main className="flex flex-col">
        <div
          className="flex items-center justify-center px-6 py-5 lg:hidden"
          style={{
            background:
              'linear-gradient(160deg, oklch(0.27 0.14 275) 0%, oklch(0.16 0.09 275) 100%)',
          }}
        >
          <BrandMark />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-[26rem]">
            <div className="rounded-2xl border border-border bg-card p-7 shadow-[0_1px_2px_rgba(20,16,80,0.04),0_16px_40px_-16px_rgba(20,16,80,0.18)] sm:p-9">
              <div className="mb-7">
                <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
                  Bienvenido
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Ingresa con tu cuenta de Sport City Tools.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      autoFocus
                      required
                      placeholder="nombre@sportcity.com"
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? 'login-error' : undefined}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 pl-10 text-base"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      placeholder="Tu contraseña"
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? 'login-error' : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={trackCapsLock}
                      onKeyDown={trackCapsLock}
                      onBlur={() => setCapsLock(false)}
                      className="h-11 px-10 text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                      aria-pressed={showPassword}
                      className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                  {capsLock && (
                    <p className="flex items-center gap-1.5 text-xs text-[var(--warning)]">
                      <TriangleAlert className="size-3.5" />
                      Tienes activadas las mayúsculas.
                    </p>
                  )}
                </div>

                <div aria-live="polite">
                  {error && (
                    <div
                      id="login-error"
                      role="alert"
                      className="flex items-start gap-2.5 rounded-lg border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3.5 py-3 text-sm text-destructive"
                    >
                      <CircleAlert className="mt-0.5 size-4 flex-none" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full gap-2 text-sm font-semibold"
                >
                  {loading ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      Ingresando…
                    </>
                  ) : (
                    <>
                      Ingresar
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>
            </div>

            <p className="mt-6 px-2 text-center text-xs leading-relaxed text-muted-foreground">
              ¿No puedes entrar o olvidaste tu contraseña? Pide a un
              administrador de Sport City que restablezca tu acceso.
            </p>
          </div>
        </div>

        <p className="px-6 pb-6 text-center text-xs text-muted-foreground lg:hidden">
          © {new Date().getFullYear()} Sport City Club · Uso interno
        </p>
      </main>
    </div>
  )
}
