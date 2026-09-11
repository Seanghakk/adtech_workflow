/**
 * Screen 6c — "load, per person and per stream" (Fable Brief 002 §3 /
 * README Theme 6). Same split as exceptions.ts: pure aggregation, no
 * fetching.
 *
 * IMPORTANT distinction from exceptions.ts's PIC-over-the-daily-limit
 * group: that group is date-scoped (distinct projects on ONE day — the
 * physical-presence constraint). This screen's "distinct projects" is
 * NOT date-scoped — it is how many different open projects a PIC
 * currently carries ANY open item in, across every date. The README's own
 * real-world example ("one PIC held 86 open items across 18 projects —
 * six times the daily ceiling") uses the daily ceiling of 3 only as a
 * rough comparison, not as a claim that 18 happened on one day — the
 * three-project reference line drawn on this chart is that same
 * borrowed benchmark, stated as such in the UI copy, not a re-assertion
 * of the day-level rule.
 */

export interface OpenItemForLoad {
  picId: string | null
  projectId: string
}

export interface PerPersonLoad {
  picId: string
  openItemCount: number
  distinctProjectCount: number
}

export function buildPerPersonLoad(items: OpenItemForLoad[]): PerPersonLoad[] {
  const groups = new Map<string, { itemCount: number; projectIds: Set<string> }>()

  for (const item of items) {
    if (!item.picId) continue
    const existing = groups.get(item.picId)
    if (existing) {
      existing.itemCount += 1
      existing.projectIds.add(item.projectId)
    } else {
      groups.set(item.picId, { itemCount: 1, projectIds: new Set([item.projectId]) })
    }
  }

  return [...groups.entries()]
    .map(([picId, g]) => ({
      picId,
      openItemCount: g.itemCount,
      distinctProjectCount: g.projectIds.size,
    }))
    .sort(
      (a, b) => b.distinctProjectCount - a.distinctProjectCount || b.openItemCount - a.openItemCount,
    )
}

export interface PerStreamLoad {
  stream: string
  /** ALL open projects in this stream — including ones with zero open
   *  items right now — matching the README's own sample math (BMS "9
   *  projects · 80 open" -> 8.9; the denominator is every open project in
   *  the stream, not only the ones carrying an item today). */
  projectCount: number
  openItemCount: number
  openItemsPerProject: number
}

export function buildPerStreamLoad(
  projects: { id: string; stream: string }[],
  items: { projectId: string }[],
): PerStreamLoad[] {
  const streamByProjectId = new Map(projects.map((p) => [p.id, p.stream]))

  const projectCountByStream = new Map<string, number>()
  for (const p of projects) {
    projectCountByStream.set(p.stream, (projectCountByStream.get(p.stream) ?? 0) + 1)
  }

  const itemCountByStream = new Map<string, number>()
  for (const item of items) {
    const stream = streamByProjectId.get(item.projectId)
    if (!stream) continue // item's project isn't open / isn't in this fetch — excluded, not miscounted.
    itemCountByStream.set(stream, (itemCountByStream.get(stream) ?? 0) + 1)
  }

  const streams = new Set([...projectCountByStream.keys(), ...itemCountByStream.keys()])

  return [...streams]
    .map((stream) => {
      const projectCount = projectCountByStream.get(stream) ?? 0
      const openItemCount = itemCountByStream.get(stream) ?? 0
      return {
        stream,
        projectCount,
        openItemCount,
        openItemsPerProject: projectCount === 0 ? 0 : openItemCount / projectCount,
      }
    })
    .sort((a, b) => b.openItemsPerProject - a.openItemsPerProject)
}
