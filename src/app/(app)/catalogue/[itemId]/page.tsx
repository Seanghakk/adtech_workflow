import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { formatMemberName, getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { getTeamLabelsByUserIds } from '@/lib/auth/member-teams'
import { formatDateICT, daysSinceICT } from '@/lib/format/datetime'
import { getServerTranslator } from '@/lib/i18n/server'
import { LIFECYCLE_STEPS, lifecycleStepLabel } from '@/lib/reporting/catalogue'
import { WarningAtPointOfUse } from '@/components/WarningAtPointOfUse'

export const metadata: Metadata = {
  title: 'Catalogue item — ADTECH Workflow Tracker',
}

/**
 * Screen 3a — catalogue item (Brief 026). Small-focused-panel archetype,
 * Design Note Rev 3 §4.4, 700px.
 *
 * SCHEMA FINDING, THE BRIEF'S OWN PREMISE WAS WRONG (§1's own instruction
 * to check first, not assume): workflow.catalogue_items and
 * catalogue_events already exist — migration 001, "5. CATALOGUE (theme 3)
 * — tables only, no UI this brief." They already carry exactly what this
 * screen needs: manufacturer, part_number, description, lifecycle_step
 * (CHECK 1-4), successor_item_id (self-FK), last_verified_by_id/
 * last_verified_at, and a catalogue_events table where every step change
 * carries its own reason + effective_date + recorded_by_id. No migration
 * this round. The table's own shape is ALREADY neutral to the brief's
 * §1 open scope question (sell/install-only vs. also-internal-purchases)
 * — manufacturer/part_number/description assume neither answer — so
 * nothing needed adding for that either; the scope question itself is
 * still unanswered and still needs Seanghakk's call before real data
 * goes in, exactly as §1 asks to flag.
 *
 * MOCKUP-VS-SCHEMA GAPS (div id="3a" in the mockup, read directly) —
 * reported rather than invented around, same convention as every
 * Theme 2 screen's own Result doc:
 *   - The mockup's kicker reads "Catalogue · BMS field devices" and shows
 *     "via Siemens Singapore" / "HS 8501.10" lines — no category/stream,
 *     distributor, or HS-code column exists anywhere on catalogue_items.
 *     Left out entirely rather than guessed.
 *   - The mockup's successor panel adds "Same footprint and wiring ·
 *     +$11 ea · 8-week lead" — no price or lead-time column exists.
 *     Shown here as the successor's identity and lifecycle status only.
 *   - The mockup has a "Where it is referenced" panel (SO/procurement/
 *     tender links) — no schema backs this at all: procurement_lines
 *     carries no catalogue_item_id, and no tender table exists in this
 *     app. Left out, not stubbed.
 *   - The mockup's two actions ("Confirm still current" / "Change
 *     status") are WRITE paths. Checked directly: catalogue_items and
 *     catalogue_events carry NO insert/update policy at all yet (RLS
 *     default-denies both), the same "no policy created for that command"
 *     convention migration 001 already documents for several other
 *     tables. Read-only this round, same sequencing precedent as every
 *     other record/detail screen in this app (2a/2c/2d) — a write
 *     policy lands ahead of write UI in its own future round.
 *
 * A VISUAL DEPARTURE FROM THE MOCKUP, flagged rather than silently
 * copied: the mockup colours the active lifecycle step amber. Design
 * Note Rev 3's own colour discipline is stricter than the mockup it
 * supersedes — amber means "waiting," red means "delay," full stop, on
 * every other screen in this app. A catalogue item's lifecycle position
 * is neither of those, so the active step here is ink (neutral
 * emphasis), not amber, to avoid quietly re-opening a third meaning for
 * a colour this app has otherwise kept to one meaning each.
 *
 * NO AGE LADDER, NO CARD WEIGHT anywhere on this screen (§3's own
 * instruction) — this is inventory data, not a worked item with an
 * owner and a clock. The staleness figure is a plain day count, not run
 * through getCardWeight/AgeLadder.
 *
 * BRIEF 027'S OWN DEMONSTRATION HOST: when an item has a successor on
 * file, this page also renders WarningAtPointOfUse (src/components/
 * WarningAtPointOfUse.tsx) as a clearly-labelled preview — Screen 3b's
 * real host (a tender line being priced) doesn't exist yet (blocked on
 * process discovery), and this brief's own §1 names 3a as exactly the
 * kind of real, existing screen to demonstrate it on instead of
 * inventing a fake tender screen. See that component's own comment.
 */
export default async function CatalogueItemPage({ params }: PageProps<'/catalogue/[itemId]'>) {
  const { itemId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()

  const { data: item } = await supabase
    .from('catalogue_items')
    .select(
      'id, manufacturer, part_number, description, lifecycle_step, successor_item_id, last_verified_by_id, last_verified_at',
    )
    .eq('id', itemId)
    .maybeSingle()

  if (!item) {
    notFound()
  }

  const [{ data: events }, { data: successor }] = await Promise.all([
    supabase
      .from('catalogue_events')
      .select('id, lifecycle_step, reason, effective_date, recorded_by_id, recorded_at')
      .eq('catalogue_item_id', item.id)
      .order('effective_date', { ascending: false })
      .order('recorded_at', { ascending: false }),
    item.successor_item_id
      ? supabase
          .from('catalogue_items')
          .select('id, manufacturer, part_number, lifecycle_step')
          .eq('id', item.successor_item_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const eventRows = events ?? []
  const currentEvent = eventRows.find((e) => e.lifecycle_step === item.lifecycle_step) ?? eventRows[0] ?? null

  const profiles = await getUserProfilesByIds(supabase, [
    item.last_verified_by_id,
    ...eventRows.map((e) => e.recorded_by_id),
  ])
  const verifierTeam = await getTeamLabelsByUserIds(supabase, [item.last_verified_by_id])

  const verifierLabel = item.last_verified_by_id
    ? formatMemberName(profiles.get(item.last_verified_by_id), t('membersNoProfile'))
    : null
  const verifierTeamLabel = item.last_verified_by_id ? verifierTeam.get(item.last_verified_by_id) : undefined
  const stalenessDays = item.last_verified_at ? daysSinceICT(item.last_verified_at) : null

  return (
    <div className="catalogue-item">
      <div className="catalogue-item__header">
        <div className="catalogue-item__kicker">{t('catalogueItemKicker')}</div>
        <h1 className="catalogue-item__title">{item.part_number}</h1>
        {item.description && <div className="catalogue-item__description">{item.description}</div>}
        <div className="catalogue-item__manufacturer">
          <span className="catalogue-item__manufacturer-label">{t('catalogueItemManufacturerLabel')}</span>{' '}
          {item.manufacturer}
        </div>
        <Link href="/catalogue" className="catalogue-item__back-link">
          {t('catalogueItemBackLink')}
        </Link>
      </div>

      <div className="catalogue-item__lifecycle-strip">
        {LIFECYCLE_STEPS.map((step) => (
          <span
            key={step}
            className={
              step === item.lifecycle_step
                ? 'catalogue-item__lifecycle-step catalogue-item__lifecycle-step--active'
                : 'catalogue-item__lifecycle-step'
            }
          >
            {t(lifecycleStepLabel(step))}
          </span>
        ))}
      </div>

      <div className="catalogue-item__reason-block">
        <span className="catalogue-item__reason-label">{t('catalogueItemReasonLabel')}</span>
        {currentEvent ? (
          <>
            <span className="catalogue-item__reason-meta">
              {formatDateICT(currentEvent.effective_date)}
              {currentEvent.recorded_by_id && (
                <>
                  {' · '}
                  {formatMemberName(profiles.get(currentEvent.recorded_by_id), t('membersNoProfile'))}
                </>
              )}
            </span>
            {currentEvent.reason && <p className="catalogue-item__reason-text">{currentEvent.reason}</p>}
          </>
        ) : (
          <p className="catalogue-item__reason-text catalogue-item__reason-text--empty">
            {t('catalogueItemReasonNone')}
          </p>
        )}
      </div>

      <div className="catalogue-item__panel">
        <div className="catalogue-item__panel-head">{t('catalogueItemSuccessorTitle')}</div>
        {successor ? (
          <Link href={`/catalogue/${successor.id}`} className="catalogue-item__successor">
            <span className="catalogue-item__successor-part">{successor.part_number}</span>
            <span className="catalogue-item__successor-status">{t(lifecycleStepLabel(successor.lifecycle_step))}</span>
          </Link>
        ) : (
          <p className="empty-state">{t('catalogueItemSuccessorNone')}</p>
        )}
      </div>

      <div className="catalogue-item__panel">
        <div className="catalogue-item__panel-head">{t('catalogueItemVerifiedTitle')}</div>
        {item.last_verified_at ? (
          <div className="catalogue-item__verified">
            <span className="catalogue-item__verified-date">{formatDateICT(item.last_verified_at)}</span>
            {verifierLabel && (
              <span className="catalogue-item__verified-by">
                {t('catalogueItemVerifiedBy')} {verifierLabel}
                {verifierTeamLabel && ` · ${verifierTeamLabel}`}
              </span>
            )}
            {stalenessDays !== null && (
              <span className="catalogue-item__staleness">
                {stalenessDays} {t('catalogueItemStalenessLabel')}
              </span>
            )}
          </div>
        ) : (
          <p className="empty-state">{t('catalogueItemVerifiedNever')}</p>
        )}
      </div>

      <div className="catalogue-item__panel">
        <div className="catalogue-item__panel-head">
          {t('catalogueItemHistoryTitle')}
          <span className="catalogue-item__panel-count">{eventRows.length}</span>
        </div>
        {eventRows.length === 0 ? (
          <p className="empty-state">{t('catalogueItemHistoryEmpty')}</p>
        ) : (
          <div className="catalogue-item__history-list">
            {eventRows.map((e) => (
              <div key={e.id} className="catalogue-item__history-row">
                <span className="catalogue-item__history-step">{t(lifecycleStepLabel(e.lifecycle_step))}</span>
                <span className="catalogue-item__history-date">{formatDateICT(e.effective_date)}</span>
                <span className="catalogue-item__history-by">
                  {e.recorded_by_id
                    ? formatMemberName(profiles.get(e.recorded_by_id), t('membersNoProfile'))
                    : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {successor && (
        <div className="catalogue-item__pou-demo">
          <WarningAtPointOfUse
            t={t}
            statusLabel={t(lifecycleStepLabel(item.lifecycle_step))}
            reason={currentEvent?.reason ?? null}
            successorPartNumber={successor.part_number}
            verifiedDateLabel={item.last_verified_at ? formatDateICT(item.last_verified_at) : null}
            stalenessDays={stalenessDays}
            demo
          />
        </div>
      )}

      <p className="catalogue-item__gap-note">{t('catalogueItemGapNote')}</p>
      <p className="catalogue-item__write-note">{t('catalogueItemWriteNote')}</p>
    </div>
  )
}
