/**
 * The shape and the initial value of the coverage editor's action state.
 *
 * THIS IS A PLAIN MODULE, AND THAT IS THE POINT. It has no 'use server'
 * directive, because a 'use server' file may export ONLY async functions.
 * `coverageInitialState` lived in coverage-actions.ts until 26 Sep 2026, and
 * exporting an object from there threw at module evaluation:
 *
 *   A "use server" file can only export async functions, found object.
 *
 * That killed EVERY server action on the setup route, not just coverage —
 * the actions for a route share one module, so adding a system failed with
 * "A server error occurred" even though its own action was fine. The page
 * still rendered, which is what made it confusing: reads worked, writes did
 * not.
 *
 * The interface could have stayed in the action file (types are erased and
 * never exist at runtime), but the type and its initial value belong
 * together — splitting them is how the next person puts the value back
 * beside the type in the wrong file.
 */

export interface CoverageState {
  error: string | null
  savedAt: string | null
}

export const coverageInitialState: CoverageState = { error: null, savedAt: null }
