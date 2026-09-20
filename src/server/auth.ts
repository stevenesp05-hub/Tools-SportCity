import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSupabaseServerClient } from '#/lib/supabase/server'
import { normalizeRole } from '#/lib/permissions'
import type { Role } from '#/lib/permissions'

export type CurrentUser = {
  id: string
  email: string
  role: Role
}

/**
 * El perfil (correo y rol) se guarda 30 s en memoria del servidor: sin esto, cada llamada
 * pagaba una consulta a `profiles`. Si cambia el rol o se borra a alguien, se olvida al instante
 * en esta instancia (`forgetCachedProfile`); en las demás caduca sola.
 */
const PROFILE_TTL_MS = 30_000
const profileCache = new Map<
  string,
  { email: string; role: Role; expires: number }
>()

export function forgetCachedProfile(userId: string) {
  profileCache.delete(userId)
}

async function resolveCurrentUser(): Promise<{
  user: CurrentUser
  supabase: ReturnType<typeof getSupabaseServerClient>
} | null> {
  const supabase = getSupabaseServerClient()
  // getClaims() comprueba la firma del token en local (sin viaje a Supabase Auth) y renueva la
  // sesión si caducó. Con claves de firma antiguas hace por dentro lo mismo que getUser().
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims.sub
  if (!userId) return null

  const cached = profileCache.get(userId)
  if (cached && cached.expires > Date.now()) {
    return {
      supabase,
      user: { id: userId, email: cached.email, role: cached.role },
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, role')
    .eq('id', userId)
    .single()
  if (!profile) {
    profileCache.delete(userId)
    return null
  }

  if (profileCache.size > 500) profileCache.clear()
  const role = normalizeRole(profile.role)
  profileCache.set(userId, {
    email: profile.email,
    role,
    expires: Date.now() + PROFILE_TTL_MS,
  })
  return { supabase, user: { id: userId, email: profile.email, role } }
}

/** Igual que authMiddleware, pero para rutas de descarga (API): sin sesión responde 401 en vez de un error 500. */
export const apiAuthMiddleware = createMiddleware().server(async ({ next }) => {
  const resolved = await resolveCurrentUser()
  if (!resolved) throw new Response('No autenticado', { status: 401 })
  return next({ context: resolved })
})

/** Request middleware: exige sesión válida. Usar en toda server function o server route que toque datos privados. */
export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const resolved = await resolveCurrentUser()
  if (!resolved) throw new Error('No autenticado')
  return next({ context: resolved })
})

/** No lanza si no hay sesión — para poblar el contexto del router (rutas públicas y privadas). */
export const getCurrentUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    const resolved = await resolveCurrentUser()
    return resolved?.user ?? null
  },
)

export const login = createServerFn({ method: 'POST' })
  .validator(
    z.object({ email: z.string().email(), password: z.string().min(1) }),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (error) {
      if (error.code === 'email_not_confirmed') {
        throw new Error(
          'Tu correo todavía no está confirmado. Revisa tu bandeja de entrada.',
        )
      }
      throw new Error('Correo o contraseña incorrectos')
    }
    return { ok: true as const }
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  const supabase = getSupabaseServerClient()
  await supabase.auth.signOut()
  return { ok: true as const }
})
