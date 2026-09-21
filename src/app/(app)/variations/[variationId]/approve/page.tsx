import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { formatMemberName, getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { formatDateICT, daysSinceICT } from '@/lib/format/datetime'
import { formatUsd0 } from '@/lib/format/money'
import { getServerTranslator } from '@/lib/i18n/server'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CrossNavChip } from '@/components/CrossNavChip'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'

export const metadata: Metadata = {
  title: 'Approval — ADTECH Workflow Tracker',
}

/** Supabase's untyped client (no generated Database types in this repo —
 *  every .from() call is untyped, see src/lib/supabase/server.ts's own
 *  comment) infers a doubly-nested embed like projects(clients(name))
 *  inconsistently between its array and single-row branches. A generic
 *  helper resolves the union once, rather than an inline
 *  Array.isArray(...) ternary per call site, which TS narrows fine one
 *  level deep (2a's own project/client/site pattern) but not two. */
function firstOrSelf<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined)
}

/**
 * Screen 3c, frame 1 — approving something (Brief 028 §1/§2). Phone
 * archetype, one thumb, one hand, standing up.
 *
 * §1's own instruction: confirm what "approve" means against the real
 * schema before building, don't assume. Confirmed: workflow.variations.
 * is_approved (boolean, migration 001) plus raised_by/approved_by
 * (migration 013) is the only existing candidate — read directly, not
 * guessed from the README's generic prose.
 *
 * §1's OWN ESCAPE HATCH, TAKEN: "if the real approval flow needs more
 * context than fits a phone screen, or requires data 3c can't reasonably
 * show, STOP and flag rather than forcing it." Two real blockers found
 * while confirming this, both checked directly against the live
 * migrations, neither anticipated by the brief:
 *
 *   1. NO WRITE POLICY EXISTS. workflow.variations carries a SELECT
 *      policy only (migration 001) — grepped every migration 002-017 for
 *      "variations_insert"/"variations_update"/"variations_delete": none
 *      exist anywhere. Approving or declining from this app is currently
 *      impossible at the database level, regardless of what UI is built
 *      on top. Who should even be ALLOWED to approve a variation (a real
 *      financial commitment — 2a calls the committed figure out as
 *      "money at risk") is not decided anywhere in this schema either —
 *      inventing a policy here would mean guessing a permission model
 *      this project has deliberately left open in every comparable case
 *      so far (see migration 001's own "no policy created for that
 *      command" convention).
 *
 *   2. "DECLINE" AND "ASK A QUESTION" HAVE NO SCHEMA AT ALL. is_approved
 *      is a two-state boolean (pending/approved) — there is no third
 *      "declined" state to write, and no reply/question mechanism exists
 *      for a variation the way request_handoffs exists for a request.
 *      Building either would mean inventing new columns/tables for a
 *      brief that explicitly scopes THIS round to 3c's own two frames,
 *      not a new variations workflow.
 *
 * RESULT: this frame IS built — the read side is fully real (variation,
 * project/client context, who raised it, the value, how long it has
 * waited) — but all three actions render inert, each with the reason
 * stated on screen, rather than either forcing a write that would
 * silently fail against RLS or guessing a permission model. The
 * "already committed POs" warning box the mockup shows is left out
 * entirely: workflow.procurement_lines carries no variation_id column,
 * so there is no real link to draw between a variation and any
 * procurement already committed against it.
 */
export default async function VariationApprovePage({
  params,
}: PageProps<'/variations/[variationId]/approve'>) {
  const { variationId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()

  const { data: variation } = await supabase
    .from('variations')
    .select(
      'id, project_id, description, is_approved, committed_amount, raised_at, approved_at, raised_by, approved_by, projects(name, so_number, clients(name))',
    )
    .eq('id', variationId)
    .maybeSingle()

  if (!variation) {
    notFound()
  }

  const { data: siblingVariations } = await supabase
    .from('variations')
    .select('id')
    .eq('project_id', variation.project_id)
    .order('raised_at', { ascending: true })

  const ordinal = (siblingVariations ?? []).findIndex((v) => v.id === variation.id) + 1

  const profiles = await getUserProfilesByIds(supabase, [variation.raised_by, variation.approved_by])
  const raisedByLabel = variation.raised_by
    ? formatMemberName(profiles.get(variation.raised_by), t('membersNoProfile'))
    : null
  const approvedByLabel = variation.approved_by
    ? formatMemberName(profiles.get(variation.approved_by), t('membersNoProfile'))
    : null

  const project = firstOrSelf(variation.projects)
  const client = firstOrSelf(project?.clients)

  const waitingDays = !variation.is_approved ? daysSinceICT(variation.raised_at) : null

  return (
    <>
      <Breadcrumbs
        ancestors={[
          { label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href },
          { label: project?.so_number ?? t('soRecordNoSoYet'), href: `/projects/${variation.project_id}` },
        ]}
        current={t('phoneApproveKicker')}
      />
      <div className="phone-approve">
      <div className="phone-approve__kicker">{t('phoneApproveKicker')}</div>

      <p className="phone-approve__title">
        {t('phoneApproveOrdinalPrefix')} {ordinal} · {variation.description}
      </p>

      <div className="phone-approve__context">
        {project?.so_number && <span className="so-number">{project.so_number}</span>}
        <span className="phone-approve__context-line">
          {[project?.name, client?.name].filter(Boolean).join(' · ')}
        </span>
        {raisedByLabel && (
          <span className="phone-approve__context-line">
            {t('phoneApproveRaisedBy')} {raisedByLabel}
          </span>
        )}
      </div>

      {variation.is_approved ? (
        <div className="phone-approve__approved-badge">
          {t('phoneApproveAlreadyApproved')}
          {variation.approved_at && (
            <span className="phone-approve__approved-meta">
              {' '}
              {formatDateICT(variation.approved_at)}
              {approvedByLabel && ` · ${approvedByLabel}`}
            </span>
          )}
        </div>
      ) : (
        <>
          <div className="phone-approve__figures">
            <div className="phone-approve__figure">
              <span className="phone-approve__figure-label">{t('phoneApproveValueLabel')}</span>
              <span className="phone-approve__figure-value">
                {variation.committed_amount != null ? formatUsd0(variation.committed_amount) : '—'}
              </span>
            </div>
            {waitingDays !== null && (
              <div className="phone-approve__figure">
                <span className="phone-approve__figure-label">{t('phoneApproveWaitingLabel')}</span>
                <span className="phone-approve__figure-value">{waitingDays}d</span>
              </div>
            )}
          </div>

          <div className="phone-approve__actions">
            <span className="phone-btn phone-btn--disabled phone-btn--primary">
              {t('phoneApproveAction')}
              {variation.committed_amount != null ? ` · ${formatUsd0(variation.committed_amount)}` : ''}
            </span>
            <span className="phone-btn phone-btn--disabled">{t('phoneApproveDeclineAction')}</span>
            <span className="phone-btn phone-btn--disabled phone-btn--plain">
              {t('phoneApproveAskQuestionAction')}
            </span>
            <p className="phone-approve__blocked-note">{t('phoneApproveBlockedNote')}</p>
          </div>
        </>
      )}

      {/* Brief 070 §4 — v5's own cross-navigation link chip: a variation
          (this page) referencing its project, converted from a plain
          Link (this page's only outbound link — checked directly). */}
      <CrossNavChip href={`/projects/${variation.project_id}`} label={t('phoneApproveOpenFullDetail')} />
    </div>
    </>
  )
}
