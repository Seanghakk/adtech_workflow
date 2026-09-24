/**
 * Brief 100 Part A — who may run the AutoCAD export.
 *
 * v7.2 §8.6 says "the PIC and the shop drawing team". Building Part A
 * surfaced that A&A was excluded by workflow.autocad_export_log's own
 * policy (migration 033) even though A&A can already import the shop
 * drawing BOQ, which is the same work. DECIDED 24 Sep 2026 by Seanghakk:
 * A&A may export too, made as a deliberate policy change in migration 038
 * rather than widened in application code.
 *
 * The list below is a literal transcription of that policy, and it is the
 * same team list workflow.shop_drawing_boq_lines carries — one list for
 * shop drawing work, written the same way in both places. Following the
 * table's own rule rather than defaulting to the PIC is the principle
 * Brief 099 settled, and it applies here unchanged. The policy is the real
 * enforcement; this is the app-layer half of the same gate.
 */
export const EXPORT_WRITE_TEAMS = ['shop_drawing', 'a_and_a'] as const

export interface ExportActor {
  isPic: boolean
  isSuperadmin: boolean
  teamCode: string
}

export function canRunExport(who: ExportActor): boolean {
  if (who.isSuperadmin || who.isPic) return true
  return (EXPORT_WRITE_TEAMS as readonly string[]).includes(who.teamCode)
}
