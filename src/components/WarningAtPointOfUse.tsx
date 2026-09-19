/**
 * Screen 3b — the warning at the point of use (Brief 027). Small-focused-
 * panel archetype, Design Note Rev 3 §4.4 / this brief's own §3: amber
 * for the warning itself ("waiting/caution meaning, consistent with the
 * rest of the app" — the brief's own words, and unlike the mockup's own
 * red border, this is the brief's explicit current instruction, not the
 * older mockup's literal styling, followed here).
 *
 * REAL BLOCKER, PER §1: the mockup's actual host is a tender line being
 * priced. Tender internals do not exist in this app (blocked on process
 * discovery, the standing position since early in the project) — no
 * fake tender screen was built to host this. This component is instead
 * a REUSABLE, STANDALONE piece, correct in isolation and ready to drop
 * into a real tender-pricing screen once one exists. Its only caller
 * today is catalogue/[itemId]/page.tsx (Screen 3a), demonstrating how it
 * would render for an item that has a successor on file — a
 * demonstration context, not this component's real intended host,
 * stated plainly on screen via the `demo` prop.
 *
 * MOCKUP-VS-SCHEMA GAP: the mockup's swap action shows a price delta
 * ("+$506 on this line") and the staleness notice a lead-time reminder —
 * no price or lead-time column exists on workflow.catalogue_items (same
 * finding Screen 3a's own page comment reports). Left out rather than
 * invented; the swap action names the successor only.
 *
 * All three actions (swap / price it anyway / ask Procurement) render as
 * inert, equally-weighted, button-styled elements — never real controls
 * yet, since nothing exists for them to act on. "Price it anyway" is
 * NEVER styled as the lesser or scarier choice (§2's own explicit rule)
 * — same visual weight as the swap action, an outline rather than a
 * ghost/disabled treatment.
 */
export function WarningAtPointOfUse({
  t,
  statusLabel,
  reason,
  successorPartNumber,
  verifiedDateLabel,
  stalenessDays,
  demo = false,
}: {
  t: (key: import('@/lib/i18n/dictionary').DictionaryKey) => string
  statusLabel: string
  reason: string | null
  successorPartNumber: string
  verifiedDateLabel: string | null
  stalenessDays: number | null
  /** This app has no real tender-pricing host yet (see file comment) —
   *  every current caller passes true. Kept as an explicit prop, not a
   *  hardcoded assumption, so a future real host reads as a one-line
   *  change here rather than a rewrite. */
  demo?: boolean
}) {
  return (
    <div className="pou-warning">
      {demo && (
        <div className="pou-warning__demo-banner">
          <span className="pou-warning__demo-label">{t('warningAtUseDemoLabel')}</span>
          <p className="pou-warning__demo-note">{t('warningAtUseDemoNote')}</p>
        </div>
      )}

      <div className="pou-warning__card">
        <span className="pou-warning__badge">{t('warningAtUseBadge')}</span>
        <p className="pou-warning__headline">
          {statusLabel}
          {reason && <> — {reason}.</>} {t('warningAtUseReplacedBy')}{' '}
          <span className="pou-warning__successor">{successorPartNumber}</span>.
        </p>
        <div className="pou-warning__actions">
          <span className="pou-warning__action pou-warning__action--primary">
            {t('warningAtUseSwapAction')} {successorPartNumber}
          </span>
          <span className="pou-warning__action pou-warning__action--outline">{t('warningAtUsePriceAnyway')}</span>
          <span className="pou-warning__action pou-warning__action--plain">{t('warningAtUseAskProcurement')}</span>
        </div>
        <p className="pou-warning__microcopy">{t('warningAtUseMicrocopy')}</p>
      </div>

      <div className="pou-warning__staleness">
        <span className="pou-warning__staleness-badge">{t('warningAtUseStalenessBadge')}</span>
        <p className="pou-warning__staleness-body">
          {verifiedDateLabel ? (
            <>
              {verifiedDateLabel}
              {stalenessDays !== null && ` — ${stalenessDays} ${t('warningAtUseStalenessAgo')}`}
              {'. '}
            </>
          ) : null}
          {t('warningAtUseStalenessBody')}
        </p>
        <span className="pou-warning__action pou-warning__action--plain">
          {t('warningAtUseAskProcurementVerify')}
        </span>
      </div>
    </div>
  )
}
