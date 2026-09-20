'use client'

import { useState } from 'react'
import Link from 'next/link'

export interface PrintableLabel {
  floorId: string
  floorLabel: string
  towerLabel: string | null
  qrSvg: string
}

/**
 * Brief 058 §5 — the printable labels themselves, mirroring the CMMS's
 * own AssetLabelPrint (ADTECH_CMMS_Brief_029_QR_Generation): size
 * presets shown with their resulting mm/module (every floor's QR is the
 * same fixed 49x49-module size, same reasoning as lib/floorQr.ts's own
 * comment — a UUID URL never varies in length), a Print button that
 * calls window.print(), and a .no-print/@media print split so only the
 * labels themselves — not the on-screen controls — end up on paper.
 *
 * TOKEN CHOICE, a deliberate departure from the CMMS's own pattern, not
 * an oversight: the CMMS defines separate --color-print-surface/--color-
 * print-ink tokens (pure #fff/#000) specifically because it supports a
 * dark theme and a label must stay legible white-stock/black-ink
 * regardless of how the on-screen theme is reskinned. This app has no
 * dark mode at all (confirmed: no prefers-color-scheme/data-theme
 * anywhere in globals.css) and --surface/--ink are already plain white/
 * near-black with no override path — so this reuses those two directly
 * rather than introducing a second, permanently-identical token pair
 * this app has no reskin risk to guard against.
 */
const PRESETS = [
  { key: 'small', mm: 25 },
  { key: 'medium', mm: 30 },
  { key: 'large', mm: 40 },
] as const

export function FloorLabelsPrint({
  projectId,
  projectName,
  labels,
  totalModules,
  strings: s,
}: {
  projectId: string
  projectName: string
  labels: PrintableLabel[]
  /** lib/floorQr.ts's floorQrTotalModules() — computed server-side from
   *  the real encoded URL, see that function's own comment. */
  totalModules: number
  strings: {
    kicker: string
    backToFloorConfig: string
    empty: string
    intro: string
    sizeLabel: string
    moduleSizeSuffix: string
    printButton: string
  }
}) {
  const [sizeMm, setSizeMm] = useState<number>(30)
  const moduleMm = (mm: number) => (mm / totalModules).toFixed(2)

  return (
    <div className="floor-labels">
      <div className="no-print">
        <div className="wf-admin">
          <div className="wf-admin__header">
            <div className="wf-admin__kicker">{s.kicker}</div>
            <h1 className="wf-admin__title">{projectName}</h1>
          </div>

          <p>
            <Link href={`/projects/${projectId}/floors`}>{s.backToFloorConfig}</Link>
          </p>

          {labels.length === 0 ? (
            <p className="empty-state">{s.empty}</p>
          ) : (
            <>
              <p className="floor-labels__intro">{s.intro}</p>

              <div className="floor-labels__control">
                <span className="floor-labels__control-label">{s.sizeLabel}</span>
                <div className="floor-labels__size-tabs">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className={p.mm === sizeMm ? 'btn btn--outline floor-labels__size-tab--active' : 'btn btn--outline'}
                      onClick={() => setSizeMm(p.mm)}
                    >
                      {p.mm}mm — {moduleMm(p.mm)}mm{s.moduleSizeSuffix}
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" className="btn btn--primary floor-labels__print-btn" onClick={() => window.print()}>
                {s.printButton}
              </button>
            </>
          )}
        </div>
      </div>

      {labels.length > 0 && (
        <div className="floor-labels__print-grid">
          {labels.map((label) => (
            <div key={label.floorId} className="floor-label" style={{ width: `${sizeMm}mm` }}>
              {/* Server-generated from this floor's own UUID — not user input. */}
              <div className="floor-label__qr" dangerouslySetInnerHTML={{ __html: label.qrSvg }} />
              <div className="floor-label__text">
                <div className="floor-label__project">{projectName}</div>
                <div className="floor-label__floor">
                  {label.towerLabel ? `${label.towerLabel} — ${label.floorLabel}` : label.floorLabel}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
