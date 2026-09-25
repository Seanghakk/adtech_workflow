/**
 * Brief 105 — who may record what on a material approval (v7.4 §23.6).
 *
 * Each of these is a literal transcription of the rule migration 043 already
 * enforces in RLS, following the principle Brief 099 settled: the table's own
 * rule, not the PIC by default.
 *
 *   add / start preparing / submit / record a return / record from paper
 *     → material_approval_* write policies: superadmin, the QC team, or the
 *       project's PIC
 *   attach documents
 *     → material_approval_documents write policy, which is the ONE place
 *       §23.6 widens: "Also Procurement". Both procurement teams, since this
 *       schema has procurement_local and procurement_overseas
 *   read
 *     → everyone with project access, via the same can_view_project()
 *       expression contract_boq_lines already uses
 *
 * §23.1(d) is why QC and not engineering: all submissions in ADTECH are
 * handled by QC, which also inspects delivered material against the approval,
 * so QC owns both ends of the loop. The v7.4 draft gave this to engineering
 * and was amended the same day.
 *
 * These decide what to SHOW. The policies are the real enforcement, and a
 * refusal from either is surfaced as its own sentence, never a disabled
 * control (§23.6).
 */
export const MATERIAL_APPROVAL_TEAMS = ['qc'] as const
export const PROCUREMENT_TEAMS = ['procurement_local', 'procurement_overseas'] as const

export interface ApprovalActor {
  isPic: boolean
  isSuperadmin: boolean
  teamCode: string
  /** Named in §23.6's refusal sentence, which addresses the reader by name. */
  displayName: string | null
}

const onQc = (who: ApprovalActor) =>
  (MATERIAL_APPROVAL_TEAMS as readonly string[]).includes(who.teamCode)

const onProcurement = (who: ApprovalActor) =>
  (PROCUREMENT_TEAMS as readonly string[]).includes(who.teamCode)

/**
 * §23.6's five recordings — add, start preparing, submit, record a return,
 * and record an approval made on paper. One gate, because §23.6 gives all
 * five to the same two: "QC, PIC".
 */
export function canRecord(who: ApprovalActor): boolean {
  return who.isSuperadmin || who.isPic || onQc(who)
}

/**
 * §23.6's one widening: "Attach documents — Also Procurement." Procurement
 * attaches datasheets and nothing else; it cannot add a package, submit one
 * or record a return, and migration 043's policies are written so that
 * remains true (verification check 24 exists to catch exactly that widening).
 */
export function canAttachDocuments(who: ApprovalActor): boolean {
  return canRecord(who) || onProcurement(who)
}

/**
 * §23.8 — raising a PO before approval is a Procurement action, and the
 * override it records names whoever accepted it. Never blocked (§5.4): this
 * says who may ACCEPT the warning, not who may pass it.
 */
export function canOverridePoWarning(who: ApprovalActor): boolean {
  return who.isSuperadmin || who.isPic || onProcurement(who)
}
