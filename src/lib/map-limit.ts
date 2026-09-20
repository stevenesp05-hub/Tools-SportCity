/**
 * Ejecuta `task` sobre cada elemento con como mucho `limit` tareas a la vez y devuelve los
 * resultados en el mismo orden. Si una falla, no se lanzan más y se propaga el primer error.
 */
export async function mapLimit<T, TResult>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length)
  let next = 0
  let failed = false
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++
      try {
        results[index] = await task(items[index], index)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}
