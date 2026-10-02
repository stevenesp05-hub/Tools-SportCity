/**
 * Regla de nombres de carpetas y documentos: en cada palabra solo la primera letra puede ir en
 * mayúscula («Reunión de equipo», no «REUNIÓN DE EQUIPO»). Se comprueba en el servidor (es lo que
 * manda) y en pantalla (para avisar al escribir, antes de que el servidor lo rechace).
 */
export const NAME_CASE_MESSAGE =
  'Escribe el nombre sin mayúsculas sostenidas: en cada palabra solo la primera letra puede ir en mayúscula (por ejemplo «Reunión de equipo», no «REUNIÓN DE EQUIPO»).'

/** Una letra seguida de una mayúscula dentro de la misma palabra: «REUNIÓN», «iPhone», «McDonald». */
const SHOUTED = /\p{L}\p{Lu}/u

export function hasShoutedWord(name: string): boolean {
  return SHOUTED.test(name)
}

/** Mensaje de error si el nombre incumple la regla; `null` si es válido. */
export function nameCaseError(name: string): string | null {
  return hasShoutedWord(name) ? NAME_CASE_MESSAGE : null
}

/** Lanza si el nombre incumple la regla (para el servidor: el mensaje llega tal cual a pantalla). */
export function assertNameCase(name: string): void {
  if (hasShoutedWord(name)) throw new Error(NAME_CASE_MESSAGE)
}

/**
 * Pasa un nombre «GRITADO» a la forma permitida: de cada palabra, la primera letra como esté y el
 * resto en minúscula. Se usa donde el usuario no escribe el nombre a mano (p. ej. al importar un
 * archivo, que toma el nombre del archivo): ahí se corrige en vez de rechazar.
 */
export function toNameCase(name: string): string {
  return name.replace(/\p{L}+/gu, (word) => {
    const [first = '', ...rest] = [...word]
    return first + rest.join('').toLowerCase()
  })
}
