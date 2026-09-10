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
