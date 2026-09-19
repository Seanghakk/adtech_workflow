/**
 * Brief 043 item 1 — split out from useSidebarCollapsed.ts, which is
 * `'use client'`. A Server Component importing a plain constant (not a
 * component) from a client-directive module does not get the real value
 * — React Server Components replaces every export of a `'use client'`
 * file with an opaque client reference for server-side imports, even a
 * plain string. Confirmed directly, not guessed: (app)/layout.tsx's own
 * `cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)` was logging the cookie name
 * as `[Function (anonymous)]` server-side, so it never matched the real
 * cookie and `initialCollapsed` was always undefined — the actual root
 * cause of item 1's "collapse doesn't persist across navigation," not
 * (only) the hydration-mismatch behavior the cookie fix was meant to
 * close. Same fix shape as the CMMS's own sidebarCookieNames.ts, which
 * exists for this exact reason.
 */
export const SIDEBAR_COLLAPSED_COOKIE = 'wf_sidebar_collapsed'
