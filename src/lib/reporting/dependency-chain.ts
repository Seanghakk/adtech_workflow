/**
 * Screen 2d — dependency chain (Brief 023). Pure grouping/aggregation,
 * deliberately separate from the page's data-fetching — same split as
 * the rest of reporting/ (board.ts, exceptions.ts, load.ts): a Server
 * Component fetches, plain functions compute.
 *
 * Shared between /projects/[projectId]/dependencies (the full chain) and
 * /projects/[projectId] (2a's own "linked dependency chain" summary
 * panel), so the slip math cannot drift between the two screens that
 * show it.
 */
import { daysSinceICT } from '@/lib/format/datetime'

export interface DependencyLink {
  id: string
  sequence: number
  name: string
  days_allowed: number | null
  started_at: string | null
  ended_at: string | null
  created_at: string
}

export type DependencyLinkStatus = 'not_started' | 'in_progress' | 'done'

export interface ComputedDependencyLink {
  link: DependencyLink
  status: DependencyLinkStatus
  daysTaken: number | null
  overrunDays: number | null
  /** Slip already accumulated from links BEFORE this one — the
   *  propagation this screen exists to show (Brief 023 §2.2). */
  upstreamSlip: number
}

/** Callers must already have ordered `links` by sequence — a chain is a
 *  single ordered list per project (Brief 023 §1's own schema finding),
 *  not a graph, so there is no ordering to do here. */
export function computeDependencyChain(links: DependencyLink[]): {
  rows: ComputedDependencyLink[]
  totalSlip: number
} {
  let runningSlip = 0
  const rows: ComputedDependencyLink[] = []

  for (const link of links) {
    const status: DependencyLinkStatus = !link.started_at
      ? 'not_started'
      : link.ended_at
        ? 'done'
        : 'in_progress'

    const daysTaken =
      status === 'done'
        ? daysSinceICT(link.started_at as string, link.ended_at as string)
        : status === 'in_progress'
          ? daysSinceICT(link.started_at as string)
          : null

    const overrunDays =
      daysTaken !== null && link.days_allowed !== null ? Math.max(0, daysTaken - link.days_allowed) : null

    rows.push({ link, status, daysTaken, overrunDays, upstreamSlip: runningSlip })

    if (overrunDays !== null) {
      runningSlip += overrunDays
    }
  }

  return { rows, totalSlip: runningSlip }
}
