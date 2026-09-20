import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getServerTranslator } from '@/lib/i18n/server'

export const metadata: Metadata = {
  title: 'Shop Drawing BOQ — ADTECH Workflow Tracker',
}

/** Migration 022 §3 — Shop Drawing or A&A team, not PIC. */
const WRITE_TEAM_CODES = ['shop_drawing', 'a_and_a']

/**
 * Brief 055 — Shop Drawing BOQ, minimal list/view screen. No manual-entry
 * screen exists for this tier yet (confirmed before building: grepped the
 * whole src tree for shop_drawing_boq_lines/_locations reads — none, apart
 * from this brief's own new files). Built as the reachability anchor the
 * import screen needs, per the brief's own instruction ("if manual entry
 * does not exist, place the import entry point wherever makes sense
 * alongside the Shop Drawing BOQ list/view") — display-only, no add/edit/
 * delete UI, matching this brief's own scope (import only, re-import/
 * update/merge explicitly out of scope).
 *
 * Team-gated, not PIC-gated (migration 022 §3) — mirrors update/
 * floor-actions.ts's own requireTeam() shape for the app-layer belt-and-
 * suspenders check (a different local check per file, per this app's own
 * convention); RLS is the real enforcement. Reading is NOT team-restricted
 * (shop_drawing_boq_lines_select is_member()-scoped, same as every other
 * BOQ tier) — only the import link and its write path are gated.
 */
export default async function ShopDrawingBoqPage({ params }: PageProps<'/projects/[projectId]/shop-drawing-boq'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()
  const { member } = await getCurrentMember()

  const { data: project } = await supabase.from('projects').select('id, name').eq('id', projectId).maybeSingle()

  if (!project) {
    notFound()
  }

  const canWrite = Boolean(member && WRITE_TEAM_CODES.includes(member.teamCode))

  const { data: lineRows } = await supabase
    .from('shop_drawing_boq_lines')
    .select('id, system_type, description, brand, model, unit, total_quantity, requested_quantity')
    .eq('project_id', project.id)
    .order('created_at')

  const lines = lineRows ?? []

  return (
    <div className="wf-admin">
      <div className="wf-admin__header">
        <div className="wf-admin__kicker">{t('shopDrawingBoqKicker')}</div>
        <h1 className="wf-admin__title">{project.name}</h1>
      </div>

      <p>
        <Link href={`/projects/${project.id}`}>{t('shopDrawingBoqBackToSoRecord')}</Link>
      </p>

      {canWrite && (
        <p>
          <Link href={`/projects/${project.id}/shop-drawing-boq/import`}>{t('shopDrawingBoqGoToImport')}</Link>
        </p>
      )}

      {!canWrite && <p className="shop-drawing-boq__note">{t('shopDrawingBoqNotTeamNote')}</p>}

      {lines.length === 0 ? (
        <p className="empty-state">{t('shopDrawingBoqEmpty')}</p>
      ) : (
        <table className="wf-admin-table">
          <thead>
            <tr>
              <th>{t('shopDrawingBoqColSystemType')}</th>
              <th>{t('shopDrawingBoqColDescription')}</th>
              <th>{t('shopDrawingBoqColBrand')}</th>
              <th>{t('shopDrawingBoqColModelPartNumber')}</th>
              <th>{t('shopDrawingBoqColUnit')}</th>
              <th>{t('shopDrawingBoqColQuantity')}</th>
              <th>{t('shopDrawingBoqColRequested')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.system_type}</td>
                <td>{line.description}</td>
                <td>{line.brand ?? '—'}</td>
                <td>{line.model ?? '—'}</td>
                <td>{line.unit}</td>
                <td>{line.total_quantity}</td>
                <td>{line.requested_quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
