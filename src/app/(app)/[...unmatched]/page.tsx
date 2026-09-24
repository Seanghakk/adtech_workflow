import { notFound } from 'next/navigation'

/**
 * Brief 100 route walk, finding 2 — the catch-all that gives an
 * UNMATCHED path the app shell.
 *
 * Next resolves a URL that matches no route at all against the ROOT
 * not-found, which sits outside the (app) route group and therefore
 * outside the shell. The walk measured what that produced: thirty-three
 * characters, no rail, no links, no way back — the one genuine dead end
 * found anywhere in the app. Reachable by a typo, a stale bookmark, or
 * one of the bare paths v7.2 §20 lists that only exist in their
 * per-project form (/floors, /contract-boq, /shop-drawing-boq).
 *
 * This page matches those paths so they enter (app) instead, and then
 * immediately calls notFound(), which renders (app)/not-found.tsx WITH
 * the shell. It deliberately does nothing else: it is a router
 * placement, not a screen.
 *
 * It cannot shadow a real route. Next prefers a static segment, then a
 * dynamic one, and only then a catch-all, so every existing route —
 * including /login and the /api handlers, which are not in this group
 * at all — still wins. It matches one segment minimum, so `/` is
 * untouched.
 */
export default function UnmatchedPath(): never {
  notFound()
}
