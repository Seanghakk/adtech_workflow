/**
 * What the coverage editor starts with selected — v7.4 §6.5.
 *
 * "A system added by hand opens the editor with every floor selected — that
 * was the behaviour before D096."
 *
 * THE DISTINCTION THIS FUNCTION EXISTS TO MAKE. "Just created" is not the
 * same as "covers nothing". §6.5 gives an uncovered system its own copy —
 * "No floors." in amber, "Progress cannot be recorded for <system> until it
 * covers at least one", action "Set floors" — which means a system scoped to
 * nothing is a legitimate, finished state, not an unfinished one. Selecting
 * every floor for it each time somebody opens the editor would quietly push
 * them towards undoing a decision they made on purpose.
 *
 * So the full pre-selection is offered ONCE, on the add, and never again.
 *
 * It pre-selects; it does not save. Coverage is real data (migration 045's
 * header), so nothing is written until the person presses Save.
 */
export function initialCoverageSelection(
  allFloorIds: string[],
  coveredFloorIds: string[],
  justCreated: boolean,
): string[] {
  return justCreated ? [...allFloorIds] : [...coveredFloorIds]
}
