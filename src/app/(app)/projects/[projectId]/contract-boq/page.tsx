import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
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
    .select('id, name, pic_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) {
    notFound()
  }

  const isPic = Boolean(user && project.pic_id && project.pic_id === user.id)

  const { data: lineRows } = await supabase
    .from('contract_boq_lines')
    .select('id, section_label, description, brand, unit, quantity, requested_quantity')
    .eq('project_id', project.id)
    .order('created_at')

  const lineIds = (lineRows ?? []).map((l) => l.id)

  const { data: locationRows } = lineIds.length
    ? await supabase
        .from('contract_boq_line_locations')
        .select('contract_boq_line_id, location_label, quantity')
        .in('contract_boq_line_id', lineIds)
    : { data: [] }

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
    <div className="wf-admin">
      <div className="wf-admin__header">
        <div className="wf-admin__kicker">{t('contractBoqKicker')}</div>
        <h1 className="wf-admin__title">{project.name}</h1>
      </div>

      <p>
        <Link href={`/projects/${project.id}`}>{t('contractBoqBackToSoRecord')}</Link>
      </p>

      {isPic && (
        <p>
          <Link href={`/projects/${project.id}/contract-boq/import`}>{t('contractBoqGoToImport')}</Link>
        </p>
      )}

      {!isPic && <p className="contract-boq__note">{t('contractBoqNotPicNote')}</p>}

      {lines.length === 0 ? (
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
  )
}
