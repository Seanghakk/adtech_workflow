/**
 * Single bilingual EN/KM dictionary for this app's own surrounding UI
 * chrome (Brief 002 §5.2). Domain nouns NEVER go through this — team
 * codes, stream codes (ELV/BMS/FAS), SO numbers, and reason_codes labels
 * stay upright English in both modes (README, Localization) and are
 * rendered from their own source (workflow.teams.label_en,
 * workflow.reason_codes.label_en/label_km), never from here.
 *
 * KHMER IS DELIBERATELY NOT TRANSLATED YET. Every `km` value below is a
 * literal copy of its `en` value, not a real translation — writing actual
 * Khmer here would mean guessing it, and the design handoff is explicit
 * that provisional/placeholder text should be left untranslated pending a
 * native-speaker pass (the same rule Brief 001 §4.4 applied to
 * workflow.reason_codes.label_km, which is NULL throughout for the same
 * reason). The language TOGGLE is real and switching works; the KM
 * strings behind it are English placeholders until that pass happens.
 * Do not fill these in without a native speaker reviewing them.
 */

export type Lang = 'en' | 'km'

const en = {
  appName: 'ADTECH',
  appKicker: 'Workflow Tracker',
  navSignOut: 'Sign out',
  navUpdateProgress: 'Update progress',
  langToggleLabel: 'Language',

  loginTitle: 'Sign in',
  loginEmail: 'Email',
  loginPassword: 'Password',
  loginSubmit: 'Sign in',
  loginSubmitPending: 'Signing in…',
  loginErrorGeneric: 'Could not sign in with those details.',

  noAccessTitle: 'No access to the Workflow Tracker',
  noAccessBody:
    'Your account is signed in, but no active Workflow Tracker membership exists for it yet. Ask a manager to add you.',
  noAccessSignOut: 'Sign out',

  dashboardTitle: 'Update progress',
  dashboardEmpty: 'No projects yet. Nothing to report on until the first project lands.',
  dashboardOpenItems: 'open sub-items',
  dashboardUnassigned: 'Unassigned',

  updateLastReported: 'Last reported',
  updateThisWeek: 'This week',
  updateMovement: 'Movement',
  updateTapToType: 'Tap to type · whole numbers',
  updateClearsThreshold: 'Clears the 5-point threshold',
  updateDrawnUnchanged: 'Drawn as unchanged',
  updateReasonLabel: 'Reason for this number',
  updateReasonLabelNoMovement: 'Why it has not moved',
  updateRequired: 'Required',
  updateNoteLabel: 'Note',
  updateNoteOptional: '(optional)',
  updateSave: 'Save update',
  updateSaveNoChange: 'Save — no change',
  updateCancel: 'Cancel',
  updateBlockedTitle: 'Pick a reason to save this update.',
  updateBlockedBody:
    'A change needs one line of explanation before it can be saved — no modal, no toast, and the click is never let through to be scolded afterwards.',
  updateSaveHint: 'Saving posts one Telegram line to the project group. No reply is read.',
  updateBy: 'by',
  updateUnreported: 'Not yet reported',
  updatePicUnassignedTitle: 'No PIC is assigned to this project.',
  updatePicUnassignedBody:
    'With no manager bypass, nobody can save an update here until a PIC is set — ask a manager to assign one.',
  updatePicRestrictedTitle: 'Only this project’s PIC can save an update here.',
  updatePicRestrictedBodyPrefix: 'Assigned to',

  navExceptions: 'Exceptions',
  navLoad: 'Load',

  exceptionsTitle: 'Where the work is stuck',
  exceptionsKicker: 'Reporting review',
  exceptionsOpenProjects: 'open projects',
  exceptionsInException: 'in an exception group',
  exceptionsGroupNoPic: 'No PIC assigned',
  exceptionsGroupNoPicCaption:
    'Nobody can save an update here until a PIC is set — no manager bypass exists.',
  exceptionsGroupNoReason: 'No reason given',
  exceptionsGroupNoReasonCaption: 'Never reported on since it opened.',
  exceptionsGroupStalled: 'Stalled',
  exceptionsGroupStalledCaption: 'No meaningful movement. Sorted by stall duration.',
  exceptionsGroupPicLimit: 'PIC over the daily limit',
  exceptionsGroupPicLimitCaption:
    'More than three distinct projects scheduled on one day. Presence, not list length.',
  exceptionsGroupBand: 'The 90–99 band',
  exceptionsGroupBandCaption: 'Nearly done and not moving — where jobs quietly die.',
  exceptionsEmptyGroup: 'Nothing in this group.',
  exceptionsEmpty: 'No open projects yet — nothing to review.',
  exceptionsNoReasonOnFile: 'No reason on file',
  exceptionsProjectsToday: 'projects today',
  exceptionsOpenItems: 'open items',
  exceptionsLimitMultiple: '× limit',
  exceptionsFootnote:
    'Groups sort by age or stall duration descending, never by date created. A project can appear in more than one group — that repetition is the point, not a bug to de-duplicate away.',

  loadTitle: 'Who is carrying what',
  loadKicker: 'Load',
  loadSubhead: 'Distinct projects per day — never total item count',
  loadPerPerson: 'Per person',
  loadPerPersonCaption: 'Bars are total distinct open projects held right now, across all dates.',
  loadPerPersonLegend: 'Red past three projects',
  loadThreeProjectLine: 'The three-project line',
  loadOpenItems: 'open items',
  loadPerStream: 'Per stream',
  loadPerStreamCaption: 'Average open items per open project, by stream.',
  loadProjectsCount: 'projects',
  loadOpenCount: 'open',
  loadEmpty: 'No open items assigned to anyone yet.',

  navSales: 'Maintenance clients',
  salesMonitoringTitle: 'Maintenance clients',
  salesMonitoringReadOnlyNote:
    'View only — no create or write action lives on this screen. Contact Project Management to act on anything shown here.',
  salesMonitoringEmpty: 'No maintenance-flagged projects are visible to you yet.',
  salesAssignLinkLabel: 'Assign client owners',
} as const

export type DictionaryKey = keyof typeof en

const km: Record<DictionaryKey, string> = { ...en }

export const dictionaries: Record<Lang, Record<DictionaryKey, string>> = { en, km }
