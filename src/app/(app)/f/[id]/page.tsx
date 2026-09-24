import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/uuid'

/**
 * The QR resolve route (Brief 058), mirroring the CMMS's own /a/[id]
 * (ADTECH_CMMS_Brief_029_QR_Generation) — read first, followed, not
 * redesigned. /f/<floor-uuid>, reached by scanning a printed floor
 * label. Minimal: it does no work of its own beyond resolving the id
 * and redirecting. As of Brief 100 Part E it lands on the scanned-floor
 * PHONE page (/floors/[floorId]/scan, v7.2 §12) rather than the desktop
 * floor breakdown it originally redirected to — see the redirect's own
 * comment below for why that moved and what it does not change.
 *
 * NOT-SIGNED-IN HANDLING (§4): unlike the CMMS, which had to build its
 * own /login?redirect= mechanism for this exact flow, this app already
 * has an equivalent, more general one — src/proxy.ts redirects any
 * unauthenticated request under (app) (this route included) to
 * /login?next=<original path>, and login/actions.ts's safeNextPath()
 * already lands the person back on that exact path post-login. Nothing
 * added here for that case; it is already handled by every route in
 * this group, not a new mechanism built to mirror the CMMS's own.
 *
 * NOT-FOUND HANDLING: the CMMS renders its own bilingual
 * AssetNotFoundClient for a bad/deleted id. This app has no equivalent
 * component anywhere — its own established convention for exactly this
 * "missing or not visible via RLS" situation (SO record page, the
 * update page, every project-scoped route) is next/navigation's plain
 * notFound(), used identically here rather than inventing a new
 * component this app has never had, for the one route that happens to
 * be reached by a QR code instead of a click.
 */
export default async function FloorResolvePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // A worn/misread label must fail gracefully, not throw a raw Postgres
  // "invalid input syntax for type uuid" error — checked before ever
  // reaching the database, same as the CMMS's own isUuid guard.
  if (!isUuid(id)) {
    notFound()
  }

  const supabase = await createClient()

  const { data: floor } = await supabase
    .from('project_floors')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  // Not found OR not visible under RLS (workflow.can_view_project) are
  // not distinguishable from here, and neither is this route trying to —
  // same "not found or not visible" convention as every other project-
  // scoped page in this app.
  if (!floor) {
    notFound()
  }

  // Brief 100 Part E — REPOINTED. Brief 058 landed this on the desktop
  // update screen and Brief 078 kept it there deliberately, its own
  // header saying /f/[id] "must keep landing on the existing desktop
  // update screen until this page is actually complete — printed QR
  // labels are already in the field and would otherwise land on an
  // unfinished page." Part E completes v7.2 §12, so that condition is
  // met and §12's opening line takes effect: "The /f/[id] QR resolve
  // route points here."
  //
  // This is the one change in Part E that alters what a real scan does
  // for someone standing on a floor, so it is worth being explicit: the
  // desktop screen is unchanged and still reachable at its own route
  // (§12 — "this is an additional screen, not a replacement"); only
  // where a SCANNED label lands moves. Reverting is this one redirect.
  //
  // No sub-stage lookup any more: the phone page is per FLOOR and shows
  // all five rows itself, so the first-sub-stage anchor Brief 058 needed
  // to reach a row inside the desktop breakdown has nothing left to do.
  redirect(`/floors/${floor.id}/scan`)
}
