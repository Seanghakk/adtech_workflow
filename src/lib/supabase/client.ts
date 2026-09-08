/**
 * Browser Supabase client.
 *
 * This app shares its Supabase project/database with the ADTECH CMMS, but
 * ALL of its tables live in the dedicated `workflow` Postgres schema — see
 * Brief 001 §3. This is the ONLY place a browser client is constructed;
 * every call site must go through `createClient()` here so the schema pin
 * below can never be forgotten at a call site.
 *
 * Do not construct a `@supabase/supabase-js` client directly anywhere else
 * in this app.
 */
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'workflow' },
    },
  )
}
