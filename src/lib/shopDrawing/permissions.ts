/**
 * Brief 100 Part B — who may record what on a shop drawing (v7.2 §9.5).
 *
 * Each of these is a literal transcription of the rule the database
 * already enforces, following the principle Brief 099 settled: the table's
 * own rule, not the PIC by default.
 *
 *   start drafting / move to internal check
 *     → shop_drawing_items UPDATE policy: superadmin, shop_drawing,
 *       a_and_a, or the project's PIC
 *   record the internal check
 *     → workflow.record_shop_drawing_check() checks this itself, and is
 *       deliberately NARROWER than workflow.is_manager(): the Shop Drawing
 *       team's own manager, with no admin bypass and no other-team-manager
 *       bypass (migration 028's own comment)
 *   submit / record a return
 *     → shop_drawing_submissions INSERT/UPDATE policies: shop_drawing,
 *       a_and_a, or the project's PIC
 *
 * These decide what to SHOW. The policies and the RPC are the real
 * enforcement, and a refusal from either is surfaced as its own sentence.
 */
export const SHOP_DRAWING_TEAMS = ['shop_drawing', 'a_and_a'] as const

export interface DrawingActor {
  isPic: boolean
  isSuperadmin: boolean
  teamCode: string
  /** workflow.members.role === 'manager' AND team === 'shop_drawing'. */
  isShopDrawingManager: boolean
  /** Shown in §9.5's stamp block, which names who the check will be
   *  recorded under. Display only — the RPC takes its own auth.uid(). */
  displayName: string | null
}

const onAShopDrawingTeam = (who: DrawingActor) =>
  (SHOP_DRAWING_TEAMS as readonly string[]).includes(who.teamCode)

/** §9.5 first recording — also the gate on "Start drafting". */
export function canDraft(who: DrawingActor): boolean {
  return who.isSuperadmin || who.isPic || onAShopDrawingTeam(who)
}

/** §9.5 second recording. Narrower than every other gate in this app. */
export function canRecordCheck(who: DrawingActor): boolean {
  return who.isShopDrawingManager
}

/** §9.5 third and fourth recordings. */
export function canSubmitOrReturn(who: DrawingActor): boolean {
  return who.isPic || onAShopDrawingTeam(who)
}
