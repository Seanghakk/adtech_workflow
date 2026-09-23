import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'
import { AddContractBoqLineForm } from './AddContractBoqLineForm'
import { ContractBoqLineRow, type ContractBoqLineData } from './ContractBoqLineRow'

export const metadata: Metadata = {
  title: 'Contract BOQ — ADTECH Workflow Tracker',
}

/**
 * Brief 046 / Amendment A — Contract BOQ line entry, floor-aware. Reached
 * by click-through from the project's own SO record page (Screen 2a), not
 * the sidebar — Result 046 confirmed the sidebar (src/lib/nav.ts) is a
 * flat, global, non-project-scoped list, and every existing project-scoped
 * screen (dependencies, procurement, update) is already reached the same
 * way, per Brief 046 §3's own instruction to mirror the existing pattern.
 *
 * Server Component: fetches everything, hands the interactive parts (add
 * form, inline edit, location breakdown) to client components. isPic
 * gates every write control's render — RLS (migration 020) is the real
 * enforcement, same belt-and-suspenders convention as update/page.tsx.
 */
export default async function ContractBoqPage({ params }: PageProps<'/projects/[projectId]/contract-boq'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, pic_id, so_number')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) {
    notFound()
  }

  const isPic = Boolean(user && project.pic_id && project.pic_id === user.id)

  // Brief 094 §3.4 — the KNOWN case: on production, contract_boq_line_
  // locations didn't exist yet, this read's error was discarded, and the
  // location breakdown rendered as "no locations" — indistinguishable
  // from a project that genuinely has none. Both reads below now capture
  // their error and the page says so explicitly rather than falling
  // through to the ordinary empty-state copy.
  const { data: lineRows, error: lineRowsError } = await supabase
    .from('contract_boq_lines')
    .select('id, section_label, description, brand, unit, quantity, requested_quantity')
    .eq('project_id', project.id)
    .order('created_at')
  if (lineRowsError) {
    console.error('ContractBoqPage: contract_boq_lines read failed', lineRowsError)
  }

  const lineIds = (lineRows ?? []).map((l) => l.id)

  const { data: locationRows, error: locationRowsError } = lineIds.length
    ? await supabase
        .from('contract_boq_line_locations')
        .select('contract_boq_line_id, location_label, quantity')
        .in('contract_boq_line_id', lineIds)
    : { data: [], error: null }
  if (locationRowsError) {
    console.error('ContractBoqPage: contract_boq_line_locations read failed', locationRowsError)
  }
  const loadFailed = Boolean(lineRowsError) || Boolean(locationRowsError)

  const lines: ContractBoqLineData[] = (lineRows ?? []).map((l) => ({
    id: l.id,
    sectionLabel: l.section_label,
    description: l.description,
    brand: l.brand,
    unit: l.unit,
    quantity: l.quantity,
    requestedQuantity: l.requested_quantity,
    locations: (locationRows ?? [])
      .filter((loc) => loc.contract_boq_line_id === l.id)
      .map((loc) => ({ locationLabel: loc.location_label, quantity: loc.quantity })),
  }))

  return (
    <>
      <Breadcrumbs
        ancestors={[
          { label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href },
          { label: project.so_number ?? t('soRecordNoSoYet'), href: `/projects/${project.id}` },
        ]}
        current={t('contractBoqKicker')}
      />
      <div className="wf-admin">
      <div className="wf-admin__header">
        <div className="wf-admin__kicker">{t('contractBoqKicker')}</div>
        <h1 className="wf-admin__title">{project.name}</h1>
      </div>

      {/* Brief 070 §3 — contractBoqBackToSoRecord ('Back to SO record')
          removed: the breadcrumb's own "<SO#>" ancestor above links to
          the exact same /projects/{id} destination. */}

      {isPic && (
        <p>
          <Link href={`/projects/${project.id}/contract-boq/import`}>{t('contractBoqGoToImport')}</Link>
        </p>
      )}

      {!isPic && <p className="contract-boq__note">{t('contractBoqNotPicNote')}</p>}

      {loadFailed ? (
        <p className="contract-boq__error" role="alert">
          {t('contractBoqLoadError')}
        </p>
      ) : lines.length === 0 ? (
        <p className="empty-state">{t('contractBoqEmpty')}</p>
      ) : (
        <table className="wf-admin-table">
          <thead>
            <tr>
              <th>{t('contractBoqColSection')}</th>
              <th>{t('contractBoqColDescription')}</th>
              <th>{t('contractBoqColBrand')}</th>
              <th>{t('contractBoqColUnit')}</th>
              <th>{t('contractBoqColQuantity')}</th>
              <th>{t('contractBoqColRequested')}</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <ContractBoqLineRow key={line.id} projectId={project.id} line={line} isPic={isPic} />
            ))}
          </tbody>
        </table>
      )}

      {isPic && <AddContractBoqLineForm projectId={project.id} />}
    </div>
    </>
  )
}
