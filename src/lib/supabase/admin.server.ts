import { createClient } from '@supabase/supabase-js'

/** Cliente con la service role key: solo para tareas de administración en el servidor. Nunca importar desde el cliente. */
export function getSupabaseAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor.',
    )
  }
  return createClient(import.meta.env.VITE_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
