/**
 * Server-side Supabase client (Server Components, Server Actions, Route
 * Handlers).
 *
 * Same rule as `./client.ts`: this app's tables all live in the `workflow`
 * schema, never `public` — see Brief 001 §3. This is the ONLY place a
 * server client is constructed; every server call site must go through
 * `createClient()` here so the schema pin can never be forgotten.
 *
 * Do not construct a `@supabase/supabase-js` client directly anywhere else
 * in this app.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    db: { schema: 'workflow' },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Called from a Server Component with no response to write to.
          // Safe to ignore — src/proxy.ts (Brief 002 §5.1) refreshes the
          // session on every request, so a Server Component's own write
          // attempt here is redundant, not load-bearing.
        }
      },
    },
  })
}
