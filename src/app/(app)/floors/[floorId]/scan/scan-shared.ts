/**
 * Brief 100 Part E — shared action shapes for the scanned-floor phone
 * page.
 *
 * Its own file because a `'use server'` module may only export async
 * functions: an interface or an initial-state object exported from
 * actions.ts is a 500 at runtime ("a 'use server' file can only export
 * async functions, found object"). Every other actions.ts in this repo
 * follows the same *-shared.ts convention.
 */
import type { NotifyOutcome } from '@/lib/floorScan/notify'
import type { StoredStatus } from '@/lib/floorScan/rows'

/**
 * §12.7 — exactly three save outcomes, no fourth. 'saving' is not one of
 * them here because it is `isPending` on the client, never a value the
 * server returns: the point of §12.7 is that nothing claims the update
 * landed until the server confirms it, and a server-returned "saving"
 * could only ever be a claim made before the fact.
 */
export type ScanSaveState =
  | { kind: 'idle' }
  | { kind: 'saved'; at: string; withPhoto: boolean; newStatus: StoredStatus }
  | { kind: 'error'; message: string }

export const scanSaveInitialState: ScanSaveState = { kind: 'idle' }

export type InspectionSaveState =
  | { kind: 'idle' }
  | { kind: 'saved'; result: 'pass' | 'fail'; notify: NotifyOutcome | null }
  | { kind: 'error'; message: string }

export const inspectionInitialState: InspectionSaveState = { kind: 'idle' }
