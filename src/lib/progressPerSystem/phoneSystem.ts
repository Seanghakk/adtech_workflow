/**
 * Brief 106b — which system the phone opens after a scan (v7.4 §12.2a, D096).
 *
 * Brief 106 §4.1 and §4.2 are the constraints that shape this:
 *   · THE PRINTED QR LABELS ARE PER FLOOR AND ALREADY IN THE FIELD. The
 *     label, the /f/[id] route and the scan are unchanged. The scan
 *     resolves the FLOOR; the page then resolves the system.
 *   · CREWS SWITCH SYSTEMS DURING ONE VISIT, so changing system is a
 *     control on the page and must NEVER require a rescan.
 *
 * §12.2a's order is a precedence, not a preference: the fewer taps a crew
 * standing on a floor has to make, the better, but never at the cost of
 * recording work against the wrong system.
 */

export interface PhoneSystem {
  id: string
  name: string
  /** True when this system covers the scanned floor. */
  coversThisFloor: boolean
  /** Floors it does cover, for the "not on this floor" statement. */
  coversLabels: string[]
}

export type PhoneSystemChoice =
  /** (1) One system on the project — §12.2a: "no step at all". */
  | { kind: 'only'; systemId: string }
  /** (2) Remembered this session and it covers this floor. */
  | { kind: 'remembered'; systemId: string }
  /** (3) The picker. */
  | { kind: 'picker' }
  /** The picker, with §12.2a's statement about a remembered system that
   *  does not cover this floor. */
  | { kind: 'picker_wrong_floor'; systemId: string; systemName: string; coversLabels: string[] }
  /** No system covers this floor at all — the shared empty part. */
  | { kind: 'no_coverage' }

/**
 * §12.2a, in its stated order. The URL wins over the session, because a
 * shared or re-opened link is an explicit instruction and the session is
 * only a convenience.
 */
export function chooseSystem(args: {
  systems: PhoneSystem[]
  /** ?system= — an explicit choice already on this page. */
  fromUrl: string | null
  /** The system this member last used in this session, any floor. */
  remembered: string | null
}): PhoneSystemChoice {
  const { systems, fromUrl, remembered } = args
  const covering = systems.filter((s) => s.coversThisFloor)

  if (covering.length === 0) return { kind: 'no_coverage' }

  // (1) One system on the PROJECT — not merely one covering this floor.
  // §12.2a says "the project has one system", and a project with four
  // systems where only one reaches this floor still deserves to say which.
  if (systems.length === 1) return { kind: 'only', systemId: systems[0].id }

  const explicit = fromUrl ?? remembered
  if (explicit) {
    const hit = systems.find((s) => s.id === explicit)
    if (hit?.coversThisFloor) return { kind: 'remembered', systemId: hit.id }
    if (hit) {
      // §12.2a — the picker, with a statement rather than a silent reset.
      // Dropping them into the picker with no explanation would read as the
      // app forgetting, and they would pick the same wrong system again.
      return {
        kind: 'picker_wrong_floor',
        systemId: hit.id,
        systemName: hit.name,
        coversLabels: hit.coversLabels,
      }
    }
  }

  return { kind: 'picker' }
}

/**
 * §12.2a — "For a QC member, systems with work waiting for QC come first
 * under 5px amber rules." Everyone else sees Project setup order, which is
 * the order every other screen uses.
 */
export function orderForPicker<T extends { id: string }>(
  systems: T[],
  awaitingQcBySystem: Map<string, number>,
  isQcMember: boolean,
): T[] {
  if (!isQcMember) return systems
  return [...systems].sort((a, b) => {
    const aw = awaitingQcBySystem.get(a.id) ?? 0
    const bw = awaitingQcBySystem.get(b.id) ?? 0
    if (aw > 0 !== bw > 0) return aw > 0 ? -1 : 1
    // Within each half, Project setup order is preserved — a stable sort
    // over the array the caller already ordered.
    return 0
  })
}
