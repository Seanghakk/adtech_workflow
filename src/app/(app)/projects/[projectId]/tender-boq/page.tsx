import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'
import type { DictionaryKey } from '@/lib/i18n/dictionary'

export const metadata: Metadata = {
  title: 'Tender BOQ — ADTECH Workflow Tracker',
}

/**
 * Brief 098 §3.8 — the Tender tier had no screen anywhere in this app
 * (Brief 097 confirmed it), so imported tender lines were invisible. This
 * is a plain list using the shared 4.2 data table: a list and its import,
 * nothing more. No editing, no approval flow — deliberately less than the
 * other two tiers have, because §3.8 asks for "nothing beyond what the
 * other two tiers already do" and tender lines are read-only today
 * (tender_boq_lines' own RLS is superadmin-only for every write; the
 * import reaches it through migration 037's SECURITY DEFINER function).
 */
export default async function TenderBoqPage({ params }: PageProps<'/projects/[projectId]/tender-boq'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, pic_id, so_number')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError) {
    return <LoadFailed t={t} headline="tenderBoqLoadFailedHeadline" />
  }
  if (!project) {
    notFound()
  }

  const isPic = Boolean(user && project.pic_id && project.pic_id === user.id)

  const { data: lines, error: linesError } = await supabase
    .from('tender_boq_lines')
    .select('id, item_number, system_type, description, brand, unit, total_quantity')
    .eq('project_id', projectId)
    .order('item_number')

  // v7.2 §21.0 — a failed read shows the failed state, never an empty table.
  if (linesError) {
    return <LoadFailed t={t} headline="tenderBoqLoadFailedHeadline" />
  }

  const rows = lines ?? []

  return (
    <>
      <Breadcrumbs
        ancestors={[
          { label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href },
          { label: project.so_number ?? t('soRecordNoSoYet'), href: `/projects/${project.id}` },
          { label: t('setupKicker'), href: `/projects/${project.id}/setup#boq` },
        ]}
        current={t('tenderBoqKicker')}
      />
      <div className="wf-admin">
        <div className="wf-admin__header">
          <div className="wf-admin__kicker">{t('tenderBoqKicker')}</div>
          <h1 className="wf-admin__title">{project.name}</h1>
        </div>

        {rows.length === 0 ? (
          <div className="wf-empty-state-card">
            <p className="wf-empty-state-card__headline">{t('tenderBoqEmptyHeadline')}</p>
            <p className="wf-empty-state-card__body">{t('tenderBoqEmptyBody')}</p>
            {isPic && (
              <div className="wf-empty-state-card__actions">
                <Link href={`/projects/${project.id}/boq-import/tender`} className="btn btn--primary">
                  {t('tenderBoqImport')}
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="boq-import__note">
              {rows.length} {t('tenderBoqLineCount')}
              {isPic && (
                <>
                  {' · '}
                  <Link href={`/projects/${project.id}/boq-import/tender`}>{t('tenderBoqImport')}</Link>
                </>
              )}
            </p>
            <div className="wf-data-table">
              <div
                className="wf-data-table__row wf-data-table__row--head"
                style={{ gridTemplateColumns: '110px 1fr 2fr 1fr 80px 110px' }}
              >
                <span className="wf-data-table__head-cell">{t('tenderBoqColItemNumber')}</span>
                <span className="wf-data-table__head-cell">{t('tenderBoqColSystem')}</span>
                <span className="wf-data-table__head-cell">{t('tenderBoqColDescription')}</span>
                <span className="wf-data-table__head-cell">{t('tenderBoqColBrand')}</span>
                <span className="wf-data-table__head-cell">{t('tenderBoqColUnit')}</span>
                <span className="wf-data-table__head-cell">{t('tenderBoqColQuantity')}</span>
              </div>
              {rows.map((line) => (
                <div
                  key={line.id}
                  className="wf-data-table__row wf-data-table__row--body"
                  style={{ gridTemplateColumns: '110px 1fr 2fr 1fr 80px 110px' }}
                >
                  <span>{line.item_number ?? '—'}</span>
                  <span>{line.system_type}</span>
                  <span className="wf-data-table__cell--description">{line.description}</span>
                  <span>{line.brand ?? '—'}</span>
                  <span>{line.unit}</span>
                  <span className="wf-data-table__cell--quantity">{line.total_quantity}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function LoadFailed({ t, headline }: { t: (key: DictionaryKey) => string; headline: DictionaryKey }) {
  return (
    <div className="wf-admin">
      <div className="wf-load-failed-card" role="alert">
        <p style={{ margin: 0, fontWeight: 700 }}>{t(headline)}</p>
        <p style={{ margin: 'var(--space-2) 0 0' }}>{t('setupLoadFailedBody')}</p>
      </div>
    </div>
  )
}
