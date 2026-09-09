/**
 * Shared, validated env var readers for every Supabase client construction
 * site in this app (client.ts, server.ts, proxy.ts).
 *
 * Brief 002A: a login attempt against the real shared Supabase project 404'd
 * with the auth request going to /rest/v1/auth/v1/token instead of
 * /auth/v1/token. Investigated and could NOT reproduce it with the current
 * code and the current .env.local — a faithful direct call through
 * @supabase/ssr's createServerClient, with the real project URL/anon key
 * from .env.local, correctly hit /auth/v1/token and got a normal Supabase
 * 400 back (see Result 002A). The evidence points at a stale `next dev`
 * process from before .env.local existed/was corrected, not a code defect.
 *
 * Still worth hardening regardless of not finding a live defect in the
 * code (same call the CMMS project has made before): if
 * NEXT_PUBLIC_SUPABASE_URL is ever again set to something with a path on
 * it — e.g. the REST endpoint (".../rest/v1") instead of the bare project
 * URL, an easy mistake when copying from a dashboard page that shows both
 * — this throws a clear, immediate, actionable error at client-construction
 * time instead of producing a confusing 404 deep inside a sign-in attempt
 * that then takes real investigation to trace back to its cause.
 */
function assertBareProjectUrl(url: string, envVarName: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`${envVarName} is not a valid URL: "${url}"`)
  }

  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error(
      `${envVarName} must be the bare Supabase project URL (e.g. ` +
        `"https://<ref>.supabase.co"), with no path — got "${url}", which ` +
        `carries the path "${parsed.pathname}". A path here (e.g. copying ` +
        `the REST endpoint ".../rest/v1" instead of the project URL) is ` +
        `exactly what caused Brief 002A's login 404 — see this file's header.`,
    )
  }

  return url
}

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.')
  return assertBareProjectUrl(url, 'NEXT_PUBLIC_SUPABASE_URL')
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.')
  return key
}
