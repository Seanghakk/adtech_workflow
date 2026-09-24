import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import {
  deriveLineState,
  plotLine,
  buildDonut,
  donutArcs,
  buildConcurrencyBars,
  type DonutSegmentKey,
  type SubStageInput,
} from '@/lib/charts/overview'

export const metadata: Metadata = {
  title: 'Execution overview — ADTECH Workflow Tracker',
}

/** §13's plot box for the line. */
const BOX = { width: 720, height: 260, padLeft: 44, padBottom: 28, padTop: 12, padRight: 12 }

/** §13: 140px box, r=57, stroke 26. */
const DONUT = { size: 140, r: 57, stroke: 26 }

const DONUT_LABEL: Record<DonutSegmentKey, DictionaryKey> = {
  done: 'overviewDonutDone',
  in_progress: 'overviewDonutInProgress',
  waiting: 'overviewDonutWaiting',
  delayed: 'overviewDonutDelayed',
}

/** §13's palette, bound explicitly — no library defaults survive. */
const DONUT_COLOUR: Record<DonutSegmentKey, string> = {
  done: 'var(--navy)',
  in_progress: 'var(--wf-blue-soft)',
  waiting: 'var(--warning)',
  delayed: 'var(--danger)',
}

const STAGE_LABEL: Record<string, DictionaryKey> = {
  installation: 'overviewStageInstallation',
  tnc: 'overviewStageTnc',
}

/**
 * Brief 100 Part D — the Execution overview (v7.2 §13, §21.6).
 *
 * Overview pages ARE charts: tables are the drill-down and never appear
 * above a chart here. The six cross-project lists are that drill-down
 * layer and carry no chart of their own.
 *
 * The line is ACTUAL ONLY. No project carries a planned baseline, so there
 * is no target line and no red gap band — in their place, one plain note.
 * Read-only for everyone with project access; nothing on this page writes.
 */
export default async function ExecutionOverviewPage({
  params,
}: PageProps<'/projects/[projectId]/overview'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, so_number')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError) return <OverviewLoadFailed t={t} />
  if (!project) notFound()

  const [
    { data: historyRows, error: historyError },
    { data: floorRows, error: floorError },
    { data: systemRows, error: systemError },
  ] = await Promise.all([
    supabase
      .from('project_progress_history')
      .select('recorded_at, percent_complete')
      .eq('project_id', projectId)
      .order('recorded_at'),
    supabase.from('project_floors').select('id').eq('project_id', projectId),
    supabase.from('project_systems').select('id, name').eq('project_id', projectId).order('name'),
  ])

  if (historyError || floorError || systemError) return <OverviewLoadFailed t={t} />

  const floorIds = (floorRows ?? []).map((f) => f.id)

  // Inspections are read by project, the same way the update screen reads
  // them — one query, rather than a second round trip keyed on the
  // sub-stage ids the first query just returned.
  const [{ data: subStageRows, error: subStageError }, { data: inspectionRows, error: inspectionError }] =
    floorIds.length
      ? await Promise.all([
          supabase.from('floor_sub_stages').select('id, floor_id, stage, status').in('floor_id', floorIds),
          supabase
            .from('qc_inspections')
            .select('floor_sub_stage_id, status, inspected_at, created_at')
            .eq('project_id', projectId),
        ])
      : [
          { data: [] as { id: string; floor_id: string; stage: string; status: string }[], error: null },
          { data: [] as { floor_sub_stage_id: string; status: string; inspected_at: string | null; created_at: string }[], error: null },
        ]

  if (subStageError || inspectionError) return <OverviewLoadFailed t={t} />

  const inspectionsBySubStage = new Map<string, Array<{ result: 'pass' | 'fail'; date: string }>>()
  for (const row of inspectionRows ?? []) {
    if (row.status !== 'pass' && row.status !== 'fail') continue
    const list = inspectionsBySubStage.get(row.floor_sub_stage_id) ?? []
    list.push({ result: row.status, date: row.inspected_at ?? row.created_at })
    inspectionsBySubStage.set(row.floor_sub_stage_id, list)
  }

  const subStages: SubStageInput[] = (subStageRows ?? []).map((s) => ({
    status: s.status as SubStageInput['status'],
    inspections: inspectionsBySubStage.get(s.id) ?? [],
  }))

  // --- the line ---------------------------------------------------------
  const line = deriveLineState(
    (historyRows ?? []).map((r) => ({ at: r.recorded_at, percent: Number(r.percent_complete ?? 0) })),
    floorIds.length > 0,
  )
  // Plotted once here rather than recomputed at each point of use in the
  // markup; null is exactly the "no points" case, which draws no axes.
  const plot = line.kind === 'no-points' ? null : plotLine(line.kind === 'line' ? line.points : [line.point], BOX)
  const cellsDone = subStages.filter((s) => s.status === 'done').length
  const cellsTotal = subStages.length

  // --- the donut --------------------------------------------------------
  const donut = buildDonut(subStages)
  const arcs = donutArcs(donut, DONUT.r)

  // --- the concurrency bars (§13's required pattern) ---------------------
  const floorsReached = new Map<string, Set<string>>()
  for (const s of subStageRows ?? []) {
    if (s.status === 'not_started') continue
    const set = floorsReached.get(s.stage) ?? new Set<string>()
    set.add(s.floor_id)
    floorsReached.set(s.stage, set)
  }
  const bars = buildConcurrencyBars(
    ['installation', 'tnc'].map((stage) => ({ stage, reached: floorsReached.get(stage)?.size ?? 0 })),
    floorIds.length,
  )

  const systems = systemRows ?? []

  return (
    <>
      <Breadcrumbs
        ancestors={[
          { label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href },
          { label: project.so_number ?? t('soRecordNoSoYet'), href: `/projects/${project.id}` },
        ]}
        current={t('overviewKicker')}
      />
      <div className="wf-admin">
        <div className="wf-admin__header">
          <div className="wf-admin__kicker">{t('overviewKicker')}</div>
          <h1 className="wf-admin__title">{project.name}</h1>
        </div>

        {/* ---- the line: actual only (§13) ---- */}
        <section className="chart">
          <h2 className="chart__title">{t('overviewLineTitle')}</h2>

          {line.kind === 'no-points' ? (
            <div className="wf-empty-state-card">
              <p className="wf-empty-state-card__headline">{t('overviewLineNoPointsHeadline')}</p>
              <p className="wf-empty-state-card__body">
                {line.hasFloors
                  ? t('overviewLineNoPointsWithFloors')
                  : t('overviewLineNoPointsNoFloors')}
              </p>
              {!line.hasFloors && (
                <div className="wf-empty-state-card__actions">
                  <Link href={`/projects/${project.id}/setup`} className="btn btn--primary">
                    {t('overviewOpenProjectSetup')}
                  </Link>
                </div>
              )}
            </div>
          ) : plot ? (
            <>
              <svg
                className="chart__svg"
                viewBox={`0 0 ${BOX.width} ${BOX.height}`}
                role="img"
                aria-label={t('overviewLineTitle')}
              >
                {/* four horizontal 1px gridlines */}
                {plot.gridlines.map((y) => (
                  <line
                    key={y}
                    x1={BOX.padLeft}
                    x2={BOX.width - BOX.padRight}
                    y1={y}
                    y2={y}
                    className="chart__gridline"
                  />
                ))}
                {/* 2px ink on the left and bottom axes only */}
                <polyline
                  className="chart__axis"
                  fill="none"
                  points={`${BOX.padLeft},${BOX.padTop} ${BOX.padLeft},${BOX.height - BOX.padBottom} ${BOX.width - BOX.padRight},${BOX.height - BOX.padBottom}`}
                />
                {line.kind === 'line' && (
                  <polyline
                    className="chart__actual"
                    fill="none"
                    points={plot.path}
                  />
                )}
                {/* §21.6 "Line, one point": a single blue terminal mark and
                    no line. Otherwise §13's 4px terminal dot. */}
                <circle
                  className="chart__terminal"
                  cx={plot.terminal.x}
                  cy={plot.terminal.y}
                  r={line.kind === 'one-point' ? 4.5 : 4}
                />
                <text className="chart__tick" x={BOX.padLeft - 8} y={BOX.padTop + 4} textAnchor="end">
                  100
                </text>
                <text
                  className="chart__tick"
                  x={BOX.padLeft - 8}
                  y={BOX.height - BOX.padBottom}
                  textAnchor="end"
                >
                  0
                </text>
              </svg>

              {line.kind === 'one-point' && (
                <p className="chart__note">
                  {t('overviewLineOnePointPrefix')} {cellsDone} {t('overviewLineOnePointMiddle')}{' '}
                  {cellsTotal} {t('overviewLineOnePointSuffix')}
                </p>
              )}
            </>
          ) : null}

          {/* §13 / §21.6 — always, in place of the target and gap legend. */}
          <div className="chart__legend">
            <span className="chart__legend-chip">
              <span className="chart__swatch chart__swatch--actual" aria-hidden="true" />
              {t('overviewLegendActual')}
            </span>
            <span className="chart__note">{t('overviewNoTarget')}</span>
          </div>
        </section>

        {/* ---- the donut: status split (§13) ---- */}
        <section className="chart">
          <h2 className="chart__title">{t('overviewDonutTitle')}</h2>
          {donut.length === 0 ? (
            <div className="wf-empty-state-card">
              <p className="wf-empty-state-card__headline">{t('overviewDonutEmpty')}</p>
            </div>
          ) : (
            <div className="chart__donut-row">
              <svg
                width={DONUT.size}
                height={DONUT.size}
                viewBox={`0 0 ${DONUT.size} ${DONUT.size}`}
                role="img"
                aria-label={t('overviewDonutTitle')}
              >
                {/* rotated −90° so the first segment starts at twelve */}
                <g transform={`rotate(-90 ${DONUT.size / 2} ${DONUT.size / 2})`}>
                  {arcs.map((a) => (
                    <circle
                      key={a.key}
                      cx={DONUT.size / 2}
                      cy={DONUT.size / 2}
                      r={DONUT.r}
                      fill="none"
                      stroke={DONUT_COLOUR[a.key]}
                      strokeWidth={DONUT.stroke}
                      strokeDasharray={a.dashArray}
                      strokeDashoffset={a.dashOffset}
                    />
                  ))}
                </g>
              </svg>
              <div className="chart__legend chart__legend--stacked">
                {donut.map((s) => (
                  <span key={s.key} className="chart__legend-chip">
                    <span
                      className="chart__swatch"
                      style={{ background: DONUT_COLOUR[s.key] }}
                      aria-hidden="true"
                    />
                    {t(DONUT_LABEL[s.key])} — {s.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ---- progress by system (§13 bar) ---- */}
        <section className="chart">
          <h2 className="chart__title">{t('overviewBarTitle')}</h2>
          {systems.length === 0 ? (
            <div className="wf-empty-state-card">
              <p className="wf-empty-state-card__headline">{t('overviewBarEmptyHeadline')}</p>
              <p className="wf-empty-state-card__body">{t('overviewBarEmptyBody')}</p>
              <div className="wf-empty-state-card__actions">
                <Link href={`/projects/${project.id}/setup#systems`} className="btn btn--primary">
                  {t('overviewOpenProjectSetup')}
                </Link>
              </div>
            </div>
          ) : (
            /* Stopped and flagged: nothing records progress against a
               system, so there is no bar to draw even though the systems
               themselves exist. See the Result doc. */
            <p className="wf-refused-card" role="status">
              {t('overviewBarNoMeasure')}
            </p>
          )}
        </section>

        {/* ---- concurrency: independent bars, same left edge (§13) ---- */}
        {floorIds.length > 0 && (
          <section className="chart">
            <h2 className="chart__title">{t('overviewConcurrencyTitle')}</h2>
            <div className="chart__bars">
              {bars.map((b) => (
                <div key={b.stage} className="chart__bar-row">
                  <span className="chart__bar-label">{t(STAGE_LABEL[b.stage] ?? 'overviewStageInstallation')}</span>
                  <span className="chart__bar-track">
                    <span className="chart__bar-fill" style={{ width: `${b.fraction * 100}%` }} />
                  </span>
                  <span className="chart__bar-figure">
                    {b.reached} / {b.total} {t('overviewFloorsSuffix')}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}

function OverviewLoadFailed({ t }: { t: (key: DictionaryKey) => string }) {
  return (
    <div className="wf-admin">
      <div className="wf-load-failed-card" role="alert">
        <p style={{ margin: 0, fontWeight: 700 }}>{t('overviewLoadFailedHeadline')}</p>
        <p style={{ margin: 'var(--space-2) 0 0' }}>{t('setupLoadFailedBody')}</p>
      </div>
    </div>
  )
}
