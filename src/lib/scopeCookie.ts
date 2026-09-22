/**
 * Brief 080 §5 — the Mine / My team / Everything scope choice, shared by
 * the Board and all six cross-project lists, remembered PER DEVICE (not
 * a database setting — that would be a schema change and edges into
 * "settings," on hold platform-wide).
 *
 * Same split as sidebarCookieNames.ts, and for the identical reason: a
 * Server Component importing a plain constant from a `'use client'`
 * module gets an opaque client reference, not the real string (confirmed
 * directly by that file's own header, Brief 043 item 1) — so this name
 * lives in its own plain module, importable safely from both sides.
 *
 * Scope has THREE states, not two, so it cannot reuse usePersistedToggle
 * (useSidebarCollapsed.ts) as-is — that hook's read/write path is
 * hardcoded to a boolean ('1'/'0'). ScopeSync.tsx below re-implements the
 * SAME mechanism (cookie + localStorage, SSR-safe via a server-read
 * cookie) generalized to a 3-value string, rather than forcing scope
 * through a boolean-shaped hook.
 */
export const SCOPE_COOKIE = 'wf_scope'
