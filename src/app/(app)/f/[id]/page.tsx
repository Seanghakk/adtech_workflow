import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/uuid'

/**
 * The QR resolve route (Brief 058), mirroring the CMMS's own /a/[id]
 * (ADTECH_CMMS_Brief_029_QR_Generation) — read first, followed, not
 * redesigned. /f/<floor-uuid>, reached by scanning a printed floor
 * label. Minimal: it does no work of its own beyond resolving the id
 * and redirecting — the landing screen (screen 6a's floor breakdown,
 * Brief 024/056) already exists and is explicitly out of scope to
 * modify here (Brief 058 §6 — FloorBreakdown.tsx and floor-actions.ts
 * are untouched by this brief).
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
    .select('id, project_id')
    .eq('id', id)
    .maybeSingle()

  // Not found OR not visible under RLS (workflow.can_view_project) are
  // not distinguishable from here, and neither is this route trying to —
  // same "not found or not visible" convention as every other project-
  // scoped page in this app.
  if (!floor) {
    notFound()
  }

  // Brief 058 §3 — the QR is per FLOOR, not per floor-and-stage: a
  // printed wall label can't know which stage the scanner cares about,
  // so this lands on the floor's own panel, not one specific sub-stage,
  // and the person picks the row themselves. JUDGMENT CALL, flagged
  // rather than silently decided: FloorBreakdown.tsx's only existing
  // anchor/scroll mechanism is #substage-<id> (Brief 056), and that file
  // is explicitly off-limits to modify this round (§6) — so a genuine
  // floor-level anchor (e.g. #floor-<id>) cannot be added without
  // touching it. Reusing the EXISTING mechanism unmodified: this route
  // resolves to the floor's FIRST sub-stage by sequence (first_fix,
  // migration 008's own sequence 1, always installation's opening row)
  // and lands on THAT #substage-<id> anchor. Since every one of a
  // floor's sub-stage rows renders together in one contiguous block
  // under that floor's own card (FloorCard in FloorBreakdown.tsx),
  // scrolling to the first one puts the whole floor's panel in view —
  // satisfying "lands on the floor's panel, person picks the row"
  // exactly, through the existing mechanism, with zero changes to the
  // file this brief is forbidden from touching.
  const { data: firstSubStage } = await supabase
    .from('floor_sub_stages')
    .select('id')
    .eq('floor_id', floor.id)
    .order('sequence', { ascending: true })
    .limit(1)
    .maybeSingle()

  redirect(
    firstSubStage
      ? `/projects/${floor.project_id}/update#substage-${firstSubStage.id}`
      : `/projects/${floor.project_id}/update`,
  )
}
