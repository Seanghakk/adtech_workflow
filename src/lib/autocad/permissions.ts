/**
 * Brief 100 Part A — who may run the AutoCAD export.
 *
 * v7.2 §8.6: "It may be run by the PIC and the shop drawing team." That is
 * also, exactly, what workflow.autocad_export_log's own INSERT policy says
 * (migration 033) — checked directly rather than assumed. Following the
 * table's own rule rather than defaulting to the PIC is the principle
 * Brief 099 settled for the BOQ tiers, and it applies here unchanged.
 *
 * Note what is NOT included: A&A. The shop drawing BOQ is writable by
 * shop_drawing and a_and_a, but the export log's policy names shop_drawing
 * alone, so this does too. If that is wrong it is a policy decision, not
 * something to paper over in app code.
 */
export const EXPORT_WRITE_TEAM = 'shop_drawing'

export interface ExportActor {
  isPic: boolean
  isSuperadmin: boolean
  teamCode: string
}

export function canRunExport(who: ExportActor): boolean {
  return who.isSuperadmin || who.isPic || who.teamCode === EXPORT_WRITE_TEAM
}
