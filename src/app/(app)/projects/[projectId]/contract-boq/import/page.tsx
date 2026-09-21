import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'
import { ContractBoqImportForm } from './ContractBoqImportForm'

export const metadata: Metadata = {
  title: 'Import Contract BOQ — ADTECH Workflow Tracker',
}

/**
 * Brief 048 — Contract BOQ Excel import, reachable from the same area as
 * manual entry for this tier (a link on /projects/[projectId]/contract-boq,
 * and a link back from here), per the brief's own instruction. PIC-gated,
 * same belt-and-suspenders convention as every other project-scoped
 * screen — RLS (migration 020) is the real enforcement.
 */
export default async function ContractBoqImportPage({ params }: PageProps<'/projects/[projectId]/contract-boq/import'>) {
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

  return (
    <>
      <Breadcrumbs
        ancestors={[
          { label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href },
          { label: project.so_number ?? t('soRecordNoSoYet'), href: `/projects/${project.id}` },
          { label: t('contractBoqKicker'), href: `/projects/${project.id}/contract-boq` },
        ]}
        current={t('contractBoqImportKicker')}
      />
      <div className="wf-admin">
      <div className="wf-admin__header">
        <div className="wf-admin__kicker">{t('contractBoqImportKicker')}</div>
        <h1 className="wf-admin__title">{project.name}</h1>
      </div>

      {/* Brief 070 §3 — contractBoqImportBackToList ('Back to Contract
          BOQ') removed: the breadcrumb's own "Contract BOQ" ancestor
          above links to the exact same destination. */}

      {isPic ? (
        <ContractBoqImportForm projectId={project.id} />
      ) : (
        <p className="contract-boq__note">{t('contractBoqNotPicNote')}</p>
      )}
    </div>
    </>
  )
}
