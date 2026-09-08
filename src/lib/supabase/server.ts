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

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            // Safe to ignore once middleware is refreshing the session —
            // no session-refresh middleware exists yet in this scaffold
            // (no UI/auth flow is in scope for Brief 001).
          }
        },
      },
    },
  )
}
