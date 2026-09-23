import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { getUserProfilesByIds, formatMemberName } from '@/lib/auth/user-profiles'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import { BOQ_TIER_BY_SLUG } from '@/lib/boq/tiers'
import { buildFloorColumns } from '../../shop-drawing-boq/floor-columns'
import { BoqImportFlow } from './BoqImportFlow'

export const metadata: Metadata = {
  title: 'Import a BOQ — ADTECH Workflow Tracker',
}

/**
 * Brief 098 §3 — the one import screen, for all three tiers
 * (/projects/[projectId]/boq-import/tender|contract|shop-drawing). The two
 * older per-tier import routes now redirect here, so there is one flow to
 * maintain and one place the behaviour lives.
 *
 * PIC-gated (§4): a non-PIC still sees the section and its data, with the
 * §6.4 sentence standing in place of the controls — never a disabled
 * button. The real enforcement is migration 037's own internal check
 * inside workflow.commit_boq_import.
 */
export default async function BoqImportPage({ params }: PageProps<'/projects/[projectId]/boq-import/[tier]'>) {
  const { projectId, tier } = await params
  const config = BOQ_TIER_BY_SLUG[tier]
  if (!config) {
    notFound()
  }

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
    return <LoadFailed t={t} />
  }
  if (!project) {
    notFound()
  }

  const isPic = Boolean(user && project.pic_id && project.pic_id === user.id)

  const [{ data: towerRows }, { data: floorRows }, { count: existingCount, error: countError }] = await Promise.all([
    supabase.from('project_towers').select('id, label, sort_order').eq('project_id', projectId),
    supabase.from('project_floors').select('id, label, sort_order, tower_id').eq('project_id', projectId),
    supabase.from(config.table).select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ])

  if (countError) {
    return <LoadFailed t={t} />
  }

  const floorColumnHeaders = config.hasFloorColumns
    ? buildFloorColumns(
        (towerRows ?? []).map((tw) => ({ id: tw.id, label: tw.label, sortOrder: tw.sort_order })),
        (floorRows ?? []).map((f) => ({ id: f.id, label: f.label, sortOrder: f.sort_order, towerId: f.tower_id })),
      ).map((c) => c.header)
    : []

  const profiles = await getUserProfilesByIds(supabase, project.pic_id ? [project.pic_id] : [])
  const picLabel = project.pic_id ? formatMemberName(profiles.get(project.pic_id), t('membersNoProfile')) : null

  const tierWord = t(
    config.tier === 'tender'
      ? 'boqImportTierTender'
      : config.tier === 'contract'
        ? 'boqImportTierContract'
        : 'boqImportTierShopDrawing',
  )
  const soLabel = project.so_number ?? project.name

  return (
    <>
      <Breadcrumbs
        ancestors={[
          { label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href },
          { label: project.so_number ?? t('soRecordNoSoYet'), href: `/projects/${project.id}` },
          { label: t('setupKicker'), href: `/projects/${project.id}/setup#boq` },
        ]}
        current={t('boqImportKicker')}
      />
      <div className="wf-admin">
        <div className="wf-admin__header">
          <div className="wf-admin__kicker">
            {t('boqImportKicker')} · {tierWord}
          </div>
          <h1 className="wf-admin__title">{project.name}</h1>
        </div>

        {isPic ? (
          <BoqImportFlow
            projectId={project.id}
            tierSlug={config.slug}
            tierWord={tierWord}
            soLabel={soLabel}
            templateHeaders={[...config.fixedHeaders]}
            floorColumnHeaders={floorColumnHeaders}
            isFirstImport={(existingCount ?? 0) === 0}
            setupHref={`/projects/${project.id}/setup#boq`}
          />
        ) : (
          <p className="wf-refused-card" role="status">
            {t('boqImportRefusedPrefix')} {picLabel ?? t('dashboardUnassigned')}
            {t('boqImportRefusedSuffix')}
          </p>
        )}
      </div>
    </>
  )
}

function LoadFailed({ t }: { t: (key: DictionaryKey) => string }) {
  return (
    <div className="wf-admin">
      <div className="wf-load-failed-card" role="alert">
        <p style={{ margin: 0, fontWeight: 700 }}>{t('setupLoadFailedHeadline')}</p>
        <p style={{ margin: 'var(--space-2) 0 0' }}>{t('setupLoadFailedBody')}</p>
      </div>
    </div>
  )
}
