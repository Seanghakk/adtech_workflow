import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import { PROJECT_TAGS, DRAWING_TAGS, diffSnapshots, type MissingValueWarning } from '@/lib/autocad/export'
import { canRunExport } from '@/lib/autocad/permissions'
import { loadExportData } from './export-data'
import { DownloadCsvButton } from './DownloadCsvButton'

export const metadata: Metadata = {
  title: 'AutoCAD Sheet Set export — ADTECH Workflow Tracker',
}

/** §21.3 — "Sent per drawing — shown as a count plus the first few rows,
 *  never the whole list." */
const PREVIEW_ROWS = 5

const SECTION_LABEL: Record<MissingValueWarning['section'], DictionaryKey> = {
  identity: 'exportSectionIdentity',
  structure: 'exportSectionStructure',
  systems: 'exportSectionSystems',
  drawings: 'exportSectionDrawings',
}
const SECTION_ANCHOR: Record<MissingValueWarning['section'], string> = {
  identity: 'identity',
  structure: 'structure',
  systems: 'systems',
  drawings: 'drawings',
}

/**
 * Brief 100 Part A — the AutoCAD Sheet Set export panel (v7.2 §8, §21.3).
 *
 * v7.2 §20's route table calls this "Setup · Exports section". It is built
 * as its own route reached from that section, the same way the BOQ import
 * was in Brief 098: the panel is a full screen's worth of table, warnings
 * and format block, and the setup page is deliberately a summary. The
 * Exports section's existing "Open the export panel" link is what leads
 * here, so the section is still the way in.
 *
 * Nothing on this page blocks. Missing values warn in place and the
 * download stays live (§8.3), because a title block with a blank field is
 * a smaller problem than not being able to export at all.
 */
export default async function AutocadExportPage({ params }: PageProps<'/projects/[projectId]/export'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()
  const { user, member } = await getCurrentMember()

  const data = await loadExportData(supabase, projectId, t)
  if ('error' in data) return <LoadFailed t={t} />

  const { project, values, drawings, warnings, snapshot, preStandard, lastExport } = data

  const actor = {
    isPic: Boolean(user && project.picId && project.picId === user.id),
    isSuperadmin: Boolean(member?.isSuperadmin),
    teamCode: member?.teamCode ?? '',
  }
  const mayExport = canRunExport(actor)
  const hasDrawings = drawings.length > 0
  const changes = lastExport ? diffSnapshots(lastExport.snapshot, snapshot) : []

  if (!project.name) notFound()

  return (
    <>
      <Breadcrumbs
        ancestors={[
          { label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href },
          { label: project.soNumber ?? t('soRecordNoSoYet'), href: `/projects/${project.id}` },
          { label: t('setupKicker'), href: `/projects/${project.id}/setup#exports` },
        ]}
        current={t('exportKicker')}
      />
      <div className="wf-admin">
        <div className="wf-admin__header">
          <div className="wf-admin__kicker">{t('exportKicker')}</div>
          <h1 className="wf-admin__title">{project.name}</h1>
        </div>

        {/* §21.3 — 390px: the desk-work sentence stands in for the panel. */}
        <p className="wf-setup-desk-work-note">{t('setupDeskWorkNote')}</p>

        <div className="boq-import__desk">
          {/* §8.6 — shown with a note, never hidden. */}
          {preStandard && (
            <p className="wf-refused-card" role="status">
              {t('exportPreStandard')}
            </p>
          )}

          {/* §8.4 — the staleness notice. No bands, no red. */}
          <section className="wf-setup-section">
            {lastExport ? (
              <>
                <p className="boq-import__figures-headline">
                  {t('exportLastExportedPrefix')} {new Date(lastExport.at).toLocaleDateString()}{' '}
                  {t('exportLastExportedBy')} {lastExport.byName}
                </p>
                <p className="boq-import__note">
                  {changes.length === 0 ? t('exportNothingChanged') : <ChangeList changes={changes} t={t} />}
                </p>
              </>
            ) : (
              <>
                <p className="boq-import__figures-headline">{t('exportNeverHeadline')}</p>
                <p className="boq-import__note">
                  {t('exportNeverBodyPrefix')} {drawings.length} {t('exportNeverBodySuffix')}
                </p>
              </>
            )}
          </section>

          {/* §8.3 — missing values warn in place, each linking to its fix. */}
          {warnings.length > 0 && (
            <section className="wf-setup-section">
              {warnings.map((w) => (
                <p key={w.key} className="wf-refused-card" role="status">
                  <strong>
                    {w.count !== null ? `${w.count} ` : ''}
                    {t(w.key)}
                  </strong>
                  {' — '}
                  {w.tag} {t('exportMissingSentenceSuffix')}{' '}
                  <Link href={`/projects/${project.id}/setup#${SECTION_ANCHOR[w.section]}`}>
                    {t('exportMissingSetItIn')} {t(SECTION_LABEL[w.section])}
                  </Link>
                </p>
              ))}
            </section>
          )}

          {/* §8.2 group one — the six values that are the same on every sheet. */}
          <section className="wf-setup-section">
            <h2 className="wf-setup-section__title">{t('exportGroupOnce')}</h2>
            <div className="wf-data-table">
              <div className="wf-data-table__row wf-data-table__row--head" style={{ gridTemplateColumns: '220px 1fr' }}>
                <span className="wf-data-table__head-cell">{t('exportColTag')}</span>
                <span className="wf-data-table__head-cell">{t('exportColValue')}</span>
              </div>
              {PROJECT_TAGS.map((tag) => (
                <div
                  key={tag}
                  className="wf-data-table__row wf-data-table__row--body"
                  style={{ gridTemplateColumns: '220px 1fr' }}
                >
                  <span>{tag}</span>
                  <span>{values[tag] || '—'}</span>
                </div>
              ))}
            </div>
          </section>

          {/* §8.2 group two — a count plus the first few rows, never the whole list. */}
          {hasDrawings ? (
            <section className="wf-setup-section">
              <h2 className="wf-setup-section__title">
                {t('exportGroupPerDrawingPrefix')} {drawings.length} {t('exportGroupPerDrawingSuffix')}
              </h2>
              <div className="wf-data-table" style={{ overflowX: 'auto' }}>
                <div
                  className="wf-data-table__row wf-data-table__row--head"
                  style={{ gridTemplateColumns: `repeat(${DRAWING_TAGS.length}, minmax(110px, 1fr))` }}
                >
                  {DRAWING_TAGS.map((tag) => (
                    <span key={tag} className="wf-data-table__head-cell">
                      {tag}
                    </span>
                  ))}
                </div>
                {drawings.slice(0, PREVIEW_ROWS).map((d, i) => (
                  <div
                    key={i}
                    className="wf-data-table__row wf-data-table__row--body"
                    style={{ gridTemplateColumns: `repeat(${DRAWING_TAGS.length}, minmax(110px, 1fr))` }}
                  >
                    {DRAWING_TAGS.map((tag) => (
                      <span key={tag}>{d[tag] || '—'}</span>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ) : (
            /* §21.3 "No drawings" — the 4.5 empty part, with both doors. */
            <section className="wf-setup-section">
              <div className="wf-empty-state-card">
                <p className="wf-empty-state-card__headline">{t('exportNoDrawingsHeadline')}</p>
                <p className="wf-empty-state-card__body">{t('exportNoDrawingsBody')}</p>
                <div className="wf-empty-state-card__actions">
                  <Link href={`/projects/${project.id}/shop-drawing-boq`} className="btn btn--outline">
                    {t('exportOpenShopDrawings')}
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* §8.2 — what is NOT sent, stated in one line. */}
          <p className="boq-import__note">{t('exportNotSent')}</p>

          {/* §8.2a — the format block, or its client-format replacement. */}
          <section className="wf-setup-section">
            {project.numberingMode === 'client' ? (
              <p className="boq-import__note">{t('exportFormatClient')}</p>
            ) : (
              <>
                <h2 className="wf-setup-section__title">{t('exportFormatHeading')}</h2>
                <p className="boq-import__figures-headline">{t('exportFormatPattern')}</p>
                <p className="boq-import__note">
                  {t('exportFormatExample')} — {t('exportFormatExampleNote')}
                </p>
                <p className="boq-import__note">{t('exportFormatParts')}</p>
                <p className="boq-import__note">{t('exportFormatIso')}</p>
              </>
            )}
          </section>

          {/* §8.3 — the download stays live whatever is missing. */}
          {mayExport ? (
            <DownloadCsvButton
              projectId={project.id}
              label={hasDrawings ? t('exportDownload') : t('exportDownloadAnyway')}
            />
          ) : (
            <p className="wf-refused-card" role="status">
              {t('exportRefused')}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

function ChangeList({
  changes,
  t,
}: {
  changes: ReturnType<typeof diffSnapshots>
  t: (key: DictionaryKey) => string
}) {
  return (
    <>
      {changes.map((c, i) => (
        <span key={c.key}>
          {i > 0 && ' · '}
          {c.from !== undefined ? (
            <>
              {t(c.key as DictionaryKey)} {c.from} {t('exportChangedPicTo')} {c.to}
            </>
          ) : c.key === 'exportChangedRevisionBumped' ? (
            <>
              {t('exportChangedRevisionBumpedPrefix')} {c.count}
            </>
          ) : (
            <>
              {c.count} {t(c.key as DictionaryKey)}
            </>
          )}
        </span>
      ))}
    </>
  )
}

function LoadFailed({ t }: { t: (key: DictionaryKey) => string }) {
  return (
    <div className="wf-admin">
      <div className="wf-load-failed-card" role="alert">
        <p style={{ margin: 0, fontWeight: 700 }}>{t('exportLoadFailedHeadline')}</p>
        <p style={{ margin: 'var(--space-2) 0 0' }}>{t('setupLoadFailedBody')}</p>
      </div>
    </div>
  )
}
