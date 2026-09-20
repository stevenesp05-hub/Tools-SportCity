import type { CurrentUser } from '#/server/auth'

/**
 * Usuario de la sesión, recordado 45 s en el navegador. El `beforeLoad` raíz corre en cada
 * navegación y sin esto cada clic empezaba con un viaje al servidor solo para saber quién eres.
 * Se vacía al iniciar o cerrar sesión; los datos siguen protegidos en el servidor en cada llamada.
 */
const TTL_MS = 45_000
let cached: { user: CurrentUser; at: number } | null = null

export function readCachedUser(): CurrentUser | null {
  return cached && Date.now() - cached.at < TTL_MS ? cached.user : null
}

export function writeCachedUser(user: CurrentUser | null) {
  cached = user ? { user, at: Date.now() } : null
}

export const clearCachedUser = () => writeCachedUser(null)
