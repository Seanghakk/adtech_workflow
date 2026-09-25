'use client'

/**
 * Brief 105 — v7.4 §23.8's block on the QC material inspection (16e).
 *
 * Shared by the desktop recorder and the phone (§12.9), because §23.11
 * point 5 names both and the one thing that must not happen is the two
 * telling an inspector different things about what was approved.
 *
 * §5.5 is the rule that shapes it: A MISSING APPROVAL NEVER BLOCKS. Where
 * there is no package the block still renders, still says what to do, and
 * the inspection carries on — never a blank space, never a refusal. The
 * whole reason this feature exists is that QC was being asked to check
 * against a document the app did not hold; saying so plainly is better
 * than pretending either that it does or that nothing was asked.
 */
import { useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { formatDateICT } from '@/lib/format/datetime'

export interface ApprovedPackage {
  id: string
  ref: string
  title: string
  systemName: string | null
  manufacturer: string | null
  product: string | null
  model: string | null
  code: 'A' | 'B' | null
  returnedOn: string | null
  org: string | null
  party: string | null
  comments: string | null
  documentCount: number
  fromPaper: boolean
}

export function MaterialApprovalCheckBlock({
  packages,
  inspectionTypeLabel,
  picName,
  value,
  onChange,
}: {
  /** Already filtered to APPROVED packages by the caller — §23.8 says the
   *  offer is "from approved packages matching the inspection type's
   *  system", and a package still with a reviewer is not something an
   *  inspector can check delivered material against. */
  packages: ApprovedPackage[]
  inspectionTypeLabel: string
  picName: string | null
  value: string | null
  onChange: (packageId: string | null) => void
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  // §23.8 — no approval: a DASHED block that says what to do instead. The
  // inspection is never blocked and the control is never disabled.
  if (packages.length === 0) {
    return (
      <div className="ma-check ma-check--none">
        <div className="ma-check__headline">
          {t('materialApprovalNoneForTypePrefix')} {inspectionTypeLabel}
        </div>
        <p className="ma-check__body">
          {t('materialApprovalNoneForTypeBodyPrefix')} {picName ?? ''}
          {t('materialApprovalNoneForTypeBodySuffix')}
        </p>
      </div>
    )
  }

  const selected = packages.find((p) => p.id === value) ?? packages[0]

  return (
    <div className="ma-check">
      <div className="ma-check__headline">{t('materialApprovalCheckAgainst')}</div>

      <dl className="ma-check__grid">
        <div>
          <dt>{selected.ref}</dt>
          <dd>{selected.title}</dd>
        </div>
        <div>
          <dt>{t('materialApprovalCheckProduct')}</dt>
          <dd>
            {selected.manufacturer ? <strong>{selected.manufacturer}</strong> : null}
            {selected.product ? ` ${selected.product}` : ''}
            {selected.model ? ` · ${selected.model}` : ''}
            {!selected.manufacturer && !selected.product && '—'}
          </dd>
        </div>
        <div>
          <dt>{t('materialApprovalCheckApproved')}</dt>
          <dd>
            {selected.code ?? '—'}
            {selected.returnedOn ? ` · ${formatDateICT(selected.returnedOn)}` : ''}
            {selected.org ? ` · ${selected.org}` : ''}
            {/* §5.3 — a paper approval says so here too, because "approved
                20 Aug" with no clocks behind it is a different kind of
                record and an inspector should know which they are holding. */}
            {selected.fromPaper && ` · ${t('materialApprovalChipApprovedOnPaper')}`}
          </dd>
        </div>
        {/* §23.8 — Notes, B only. A comes back with nothing to carry. */}
        {selected.code === 'B' && selected.comments && (
          <div>
            <dt>{t('materialApprovalCheckNotes')}</dt>
            <dd>{selected.comments}</dd>
          </div>
        )}
        <div>
          <dt>{t('materialApprovalDocuments')}</dt>
          <dd>{selected.documentCount > 0 ? selected.documentCount : '—'}</dd>
        </div>
      </dl>

      {/* §23.8 — "changeable". The offered package is a default, not a
          verdict: a delivery can arrive against a different approval than
          the one the system guessed. */}
      {packages.length > 1 && (
        <div className="ma-check__change">
          {open ? (
            <select
              value={selected.id}
              onChange={(e) => {
                onChange(e.target.value)
                setOpen(false)
              }}
            >
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.ref} — {p.title}
                </option>
              ))}
            </select>
          ) : (
            <button type="button" className="ma-check__change-link" onClick={() => setOpen(true)}>
              {t('materialApprovalCoversLink')}
            </button>
          )}
        </div>
      )}

      <input type="hidden" name="approvalPackageId" value={selected.id} />
    </div>
  )
}
