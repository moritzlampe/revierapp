import { createBrowserClient } from '@supabase/ssr'

// Singleton: nur EINE Browser-Client-Instanz pro Browser-Kontext.
// Mehrere Instanzen konkurrieren sonst um den auth-token Web-Lock
// (navigator.locks) → "lock ... was released because another request
// stole it" als unhandled rejection in Sentry. Lazy beim ersten Aufruf.
let browserClient: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return browserClient
}
