import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/uuid'
import { getServerTranslator } from '@/lib/i18n/server'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { floorScanAncestors } from '@/lib/breadcrumbs'

export const metadata: Metadata = {
  title: 'Floor — ADTECH Workflow Tracker',
}

/**
 * Brief 078 / v6 §2-§3 — the phone page for a scanned floor. HEADER ONLY
 * this brief (v6 §10 build order steps 1-4); the sub-stage list, team
 * gating, status control, photo gate, QC recording, material inspection,
 * signed-out redirect and repointing /f/[id] here are all later steps
 * (5-12), explicitly out of scope.
 *
 * ROUTE: /floors/[floorId]/scan — a NEW route, not a repoint of the
 * existing /f/[id] QR resolve route (v6 §0/§1: "the QR label's /f/[id]
 * resolve route repoints here" is the EVENTUAL v6 §10 step 12, a LATER
 * brief; /f/[id] must keep landing on the existing desktop update screen
 * until this page is actually complete — printed QR labels are already
 * in the field and would otherwise land on an unfinished page). Named
 * after this app's own established `[resourceId]/verb` shape for a
 * phone-archetype screen — the two v6 §1 precedents,
 * /requests/[requestId]/status and /variations/[variationId]/approve,
 * both follow exactly this pattern (a resource id, then a verb naming
 * what happens on this specific screen); "scan" reads correctly for a
 * screen reached specifically by scanning a QR label, the same way
 * "status" and "approve" name THEIR own reason for existing.
 *
 * AUTH: no gate built here — this route sits under the (app) route
 * group, so src/proxy.ts's existing gate already covers it exactly like
 * every other signed-in page (redirects to /login?next=<path>, and
 * login/actions.ts's safeNextPath() already lands back here after
 * sign-in — the same mechanism /f/[id]'s own header documents relying on
 * for its own not-signed-in case). Nothing new built for this; v6 §8's
 * own dedicated phone sign-in-screen work is separately out of scope
 * (§7 — login is a shared platform function, held until the platform
 * migration starts).
 *
 * NO BREADCRUMB (v6 §2): "Nobody arriving from a QR sticker is
 * navigating a hierarchy." floorScanAncestors() is a named, empty
 * derivation — see its own header in src/lib/breadcrumbs.ts for why this
 * shape is used rather than simply omitting the <Breadcrumbs> call.
 *
 * NOT-FOUND: same "missing or not visible under RLS, indistinguishable
 * from here" convention as /f/[id] and every other project-scoped route
 * in this app — plain notFound(), no new component.
 */
export default async function FloorScanPage({ params }: { params: Promise<{ floorId: string }> }) {
  const { floorId } = await params

  if (!isUuid(floorId)) {
    notFound()
  }

  const supabase = await createClient()
  const t = await getServerTranslator()

  const { data: floor } = await supabase
    .from('project_floors')
    .select('id, label, tower_id, project_id')
    .eq('id', floorId)
    .maybeSingle()

  if (!floor) {
    notFound()
  }

  const [{ data: tower }, { data: project }] = await Promise.all([
    floor.tower_id
      ? supabase.from('project_towers').select('label').eq('id', floor.tower_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('projects').select('id, name, so_number, stream').eq('id', floor.project_id).maybeSingle(),
  ])

  if (!project) {
    // Same "not found or not visible" convention as above — a floor whose
    // own project is missing/not visible under RLS is not a state this
    // page can render anything meaningful for.
    notFound()
  }

  return (
    <>
      <Breadcrumbs ancestors={floorScanAncestors()} current={floor.label} />
      <div className="phone-floor-header">
        <div className="phone-floor-header__kicker">{t('phoneFloorHeaderKicker')}</div>
        <h1 className="phone-floor-header__floor-name">{floor.label}</h1>
        <div className="phone-floor-header__tower-project">
          {tower && <span className="phone-floor-header__tower">{tower.label}</span>}
          {tower && <span className="phone-floor-header__separator" aria-hidden="true">·</span>}
          <span className="phone-floor-header__project">{project.name}</span>
        </div>
        <div className="phone-floor-header__so-system">
          {project.so_number ? (
            <span className="so-number">{project.so_number}</span>
          ) : (
            <span className="so-number so-number--pending">{t('soRecordNoSoYet')}</span>
          )}
          <span className="phone-floor-header__separator" aria-hidden="true">
            ·
          </span>
          <span className="stream-tag">{project.stream.toUpperCase()}</span>
        </div>
      </div>
    </>
  )
}
