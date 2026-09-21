/**
 * Service-role Supabase client — bypasses RLS. Server-only: never import
 * this from a Client Component or expose SUPABASE_SERVICE_ROLE_KEY to the
 * browser.
 *
 * Brief 057 — this app's first use of Supabase Storage. Mirrors the CMMS's
 * own service.ts (its src/lib/supabase/service.ts) wholesale, per the
 * brief's §4 instruction to copy that pattern rather than design a new
 * one: uploads go through this client from a Route Handler, never through
 * the anon client, so the app depends on zero storage.objects RLS
 * policies, same as the CMMS's wo-photos bucket.
 *
 * Unlike ./server.ts and ./client.ts, this is NOT pinned to the workflow
 * db schema — it's constructed only for its .storage namespace, which
 * doesn't go through PostgREST schema selection at all.
 */
import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey, getSupabaseUrl } from './env'

export function createServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseSecretKey())
}
