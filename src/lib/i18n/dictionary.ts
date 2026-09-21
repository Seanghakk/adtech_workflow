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
  // Brief 039 §1 — the sidebar's own entry for "/", the project board
  // (Screen 4a). Never had a nav label before this brief: the brand mark
  // was the only link to it. Went UNUSED from Brief 064 (the new rail
  // has no Board item — reachable via the brand mark only) through
  // Brief 069 — kept regardless, per this app's own "every nav key is
  // kept once superseded" convention. Brief 070 §2.2 finally consumes
  // it again: the breadcrumb bar's own top-level "Board" ancestor on
  // every project page (src/lib/breadcrumbs.ts's own CRUMB_BOARD).
  navBoard: 'Board',
  langToggleLabel: 'Language',

  // Brief 064 §2.1 — the seven-item journey rail's own section label and
  // item labels, v5's exact wording. Short by design (v5's own table):
  // not the old nav's fuller "Post a request" etc.
  navJourneySectionLabel: 'Project journey',
  navJourneyRequest: 'Request',
  navJourneyTriage: 'Triage',
  navJourneySo: 'SO',
  navJourneyKickoff: 'Kickoff',
  navJourneyExecution: 'Execution',
  navJourneyHandover: 'Handover',
  navJourneyInventory: 'Inventory',
  // Brief 064 §2.2 — the deferred-item tag. Never opacity-dimmed (v5's
  // own explicit warning) — this is the ONLY visual marker of deferral.
  navJourneyLaterTag: 'Later',
  // Brief 064 §2.5 — the Admin collapsible's own row label and contents,
  // v5's exact wording for all five.
  navAdminRowLabel: 'Admin',
  navAdminFloors: 'Floors and zones',
  navAdminSoRegisters: 'SO registers',
  // Brief 067 §4 — three Admin additions, Brief 066's own findings.
  navAdminCatalogue: 'Parts catalogue',
  navAdminSales: 'Sales',
  navAdminClientOwners: 'Client owners',

  // Brief 067 §3 — the Execution subtree's own nine item labels, v5
  // §2.3's exact wording. "Delays & blockers" and "Who is on what"
  // reuse navExceptions/navLoad directly (same screen, same label, one
  // definition) rather than duplicating the string under a new key.
  navExecOverview: 'Overview',
  navExecShopDrawing: 'Shop drawing',
  navExecProcurement: 'Procurement',
  navExecInstallation: 'Installation',
  navExecTestingCommissioning: 'Testing & commissioning',
  navExecQcInspections: 'QC inspections',
  navExecFloorProgress: 'Floor progress',

  // Brief 064 — the shared "not built yet" landing (v4's own empty-state
  // vocabulary, part 5) behind every deferred/stub rail item. One
  // headline + one sentence + real actions per item, never a bare "soon."
  // Items 1-3 (request/triage/so) link to their REAL, already-working
  // screens as one of the actions — "deferred from this rail" is not the
  // same claim as "does not exist," and this page never blurs the two.
  comingSoonBackToBoard: 'Back to board',
  comingSoonRequestHeadline: '"Request" isn’t part of the main journey rail yet',
  comingSoonRequestBody:
    'The request intake screen exists and works — it just isn’t linked from this rail yet.',
  comingSoonRequestAction: 'Go to Post a request',
  comingSoonTriageHeadline: '"Triage" isn’t part of the main journey rail yet',
  comingSoonTriageBody: 'The triage screen exists and works — it just isn’t linked from this rail yet.',
  comingSoonTriageAction: 'Go to Triage',
  comingSoonSoHeadline: '"SO" isn’t part of the main journey rail yet',
  comingSoonSoBody: 'The Awaiting SO screen exists and works — it just isn’t linked from this rail yet.',
  comingSoonSoAction: 'Go to Awaiting SO',
  comingSoonKickoffHeadline: '"Kickoff" doesn’t have a screen yet',
  comingSoonKickoffBody: 'This step of the project journey hasn’t been built.',
  comingSoonExecutionHeadline: '"Execution" doesn’t have an overview yet',
  comingSoonExecutionBody: 'The Execution overview and its own subtree are coming in a later build step.',
  comingSoonHandoverHeadline: '"Handover" doesn’t have a screen yet',
  comingSoonHandoverBody: 'This step of the project journey hasn’t been built.',
  comingSoonInventoryHeadline: '"Inventory" doesn’t have a screen yet',
  comingSoonInventoryBody: 'This step of the project journey hasn’t been built.',
  comingSoonFloorsHeadline: 'There’s no project-wide "Floors and zones" screen yet',
  comingSoonFloorsBody:
    'Floor and zone configuration exists per project today — open a project’s own SO record page, then Floors.',
  comingSoonSoRegistersHeadline: 'SO register administration doesn’t exist yet',
  comingSoonSoRegistersBody: 'There is no admin screen for SO registers in this app today.',
  // Brief 067 §3 — the Execution subtree's own case (B)/(C) items. Case
  // B (a real per-project screen, no cross-project view) says so
  // honestly rather than reading identically to case C (no screen
  // anywhere) — see nav.ts's own header for which is which.
  comingSoonShopDrawingHeadline: '"Shop drawing" is a per-project screen',
  comingSoonShopDrawingBody:
    'Open a project from the board, then its own Shop Drawing BOQ page — there is no cross-project view of this yet.',
  comingSoonProcurementHeadline: '"Procurement" is a per-project screen',
  comingSoonProcurementBody:
    'Open a project from the board, then its own Procurement page — there is no cross-project view of this yet.',
  comingSoonFloorProgressHeadline: '"Floor progress" is a per-project screen',
  comingSoonFloorProgressBody:
    'Open a project from the board, then its own floor x sub-stage matrix — there is no cross-project view of this yet.',
  comingSoonOverviewHeadline: 'The Execution overview doesn’t exist yet',
  comingSoonOverviewBody:
    'The chart-driven overview is a later build step, blocked on a still-open question about where its target-curve data would come from.',
  comingSoonInstallationHeadline: '"Installation" doesn’t have its own screen',
  comingSoonInstallationBody:
    'Installation sub-stage tracking lives inside a project’s own floor breakdown (the update screen), not a standalone page.',
  comingSoonTestingCommissioningHeadline: '"Testing & commissioning" doesn’t have its own screen',
  comingSoonTestingCommissioningBody:
    'TNC sub-stage tracking lives inside a project’s own floor breakdown (the update screen), not a standalone page.',
  comingSoonQcInspectionsHeadline: '"QC inspections" doesn’t have its own screen',
  comingSoonQcInspectionsBody:
    'QC inspection recording lives inside a project’s own floor breakdown too — see the sub-stage rows on the update screen.',
  // Brief 070 §2.2 — "Admin" is a genuine category (8 items), same as
  // Execution, so it needs to be a real, honest breadcrumb ancestor
  // link for its own children rather than falling back to the generic
  // comingSoonFallback copy below. Same bespoke-stub-copy pattern every
  // other rail group already has.
  comingSoonAdminHeadline: '"Admin" doesn’t have its own overview screen',
  comingSoonAdminBody: 'Its items are listed in the Admin section below the rail — pick one from there.',
  comingSoonFallbackHeadline: 'Nothing here yet',
  comingSoonFallbackBody: 'This screen hasn’t been built.',
 
  loginTitle: 'Sign in',
  loginEmail: 'Email',
  loginPassword: 'Password',
  loginSubmit: 'Sign in',
  loginSubmitPending: 'Signing in…',
  loginErrorGeneric: 'Could not sign in with those details.',
  // Brief 010 §2.6/§5.5 — plain-text reset path; see globals.css's own
  // note on .login-form__reset for why this isn't a working reset flow.
  loginResetPath: 'Forgot your password? Ask a project manager to reset it for you.',
 
  noAccessTitle: 'No access to the Workflow Tracker',
  // Brief 012 §4 — wording matched to the User Management queue's own
  // wording ("Accounts waiting to be linked" / "Link account") so a
  // person told one thing finds the same thing happening on the other
  // side. Previously said "Ask a manager to add you," a different verb
  // than the queue this screen is the direct fix for.
  noAccessBody:
    "Your account is signed in, but it isn't linked to a Workflow Tracker member yet. Ask a project manager to link your account — you're already on the list they'll see.",
  noAccessSignOut: 'Sign out',
 
  // Kept under its original "dashboard" name (Brief 002) even though the
  // interim placeholder it was coined for is gone as of Brief 009 —
  // still the one shared "no PIC/owner" label used across the update
  // page, sales monitoring, and 6b/4a's boards. Renaming it is unrelated
  // churn for no behaviour change.
  dashboardUnassigned: 'Unassigned',
 
  // Screen 4a — "one board, three scopes" (Fable Brief 009 + Amendment A).
  // Replaces the interim dashboardTitle/dashboardEmpty/dashboardOpenItems
  // keys, retired as dead once this landing route stopped using them.
  boardKicker: 'Project board',
  boardTitleMine: 'Your projects',
  boardTitleMyTeam: "Your team's projects",
  boardTitleEverything: 'Every open project',
  boardScopeLabel: 'Scope',
  boardScopeMine: 'Mine',
  boardScopeMyTeam: 'My team',
  boardScopeEverything: 'Everything',
  boardGroupLabel: 'Group by',
  boardGroupStream: 'Stream',
  boardGroupPic: 'PIC',
  boardGroupAgeBand: 'Age band',
  boardLaneUnassigned: 'No PIC assigned',
  boardBandMoving: 'Moving',
  boardBandWaiting: 'Waiting',
  boardBandLate: 'Late',
  boardBandStalled: 'Stalled',
  boardBandMovingCaption: 'Reported on recently.',
  boardBandWaitingCaption: 'Waiting — blocked, not yet late.',
  boardBandLateCaption: 'No meaningful movement in over a week.',
  boardBandStalledCaption: 'Gone quiet — no movement in over two weeks.',
  boardOldest: 'oldest',
  boardEmpty: 'No open projects in this scope.',
  // Screen 5b — 4a on a tablet (Brief 025). The jump strip only renders
  // at the tablet breakpoint (src/app/globals.css) — see the board
  // page's own comment for why.
  boardJumpStripLabel: 'Jump to lane',
  boardJumpStripOverdue: 'has late or stalled projects',
  // Brief 056 §7 — the matrix's entry point on a floor-tracked project's
  // own board card.
  boardMatrixLink: 'Matrix',
  // §4 — the visibility problem, required not optional: a sales-team
  // member's view is restricted by workflow.can_view_project() to
  // maintenance-flagged projects under a client they (or their
  // supervisor) own. This must never read the same as "nothing is open."
  boardRestrictedNotice:
    'Sales-team access is restricted to maintenance-flagged projects under clients you own — this may not be every open project.',
  boardRestrictedEmpty:
    'No maintenance-flagged projects under a client you own match this scope — this is not the same as "nothing is open" app-wide.',
 
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
  // Fable Brief 003 §4.2 — the PIC (the field that actually governs write
  // permission since migration 006) is now shown positively on every
  // render of 6a, not only on the failure path; these are its labels.
  updatePicLabel: 'PIC',
  updatePicYou: 'You',
  updateOwnerLabel: 'Owner',
  // Brief 057 — photo evidence on 6a. Required only once newPercent
  // reaches 100 (see UpdateProgressForm's needsPhoto); optional otherwise.
  photoLabel: 'Photo evidence',
  photoOptional: 'Optional',
  photoAdd: 'Add photo',
  photoRetake: 'Retake',
  photoRemove: 'Remove',
  photoUploading: 'Uploading…',
  photoRetry: 'Retry',
  photoRequiredTitle: 'A photo is required to mark this 100% complete.',
  photoRequiredBody: 'That is the moment this claim carries weight — add a photo before saving.',
  photoEvidenceAlt: 'Progress update photo evidence',
 
  // Brief 067 §2 — renamed per v5 §3. UNUSED by nav.ts since Brief 064's
  // rewrite (kept, not deleted — same reasoning as every other retired
  // nav key in this file), updated anyway so nothing stale sits next to
  // the labels actually in use.
  navExceptions: 'Delays & blockers',
  navLoad: 'Who is on what',

  // Brief 067 §2 — kicker is the literal renamed label ("Delays &
  // blockers"), matching how loadKicker below already equalled the old
  // nav label 1:1 before this brief. exceptionsTitle itself is
  // deliberately UNCHANGED: "Where the work is stuck" was never a
  // paraphrase of the word "Exceptions" — original headline copy, not
  // the old name — so v5's rename doesn't require rewriting it, only
  // the label that actually says the screen's name.
  exceptionsTitle: 'Where the work is stuck',
  exceptionsKicker: 'Delays & blockers',
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
  // Brief 010 §4 — the one group where zero is genuinely good news
  // (Design Note §4.9's own example of when an empty state should read
  // as a result, not a blank).
  exceptionsPicLimitEmpty: 'No PIC is over the daily limit today.',
  exceptionsEmpty: 'No open projects yet — nothing to review.',
  exceptionsNoReasonOnFile: 'No reason on file',
  exceptionsProjectsToday: 'projects today',
  exceptionsOpenItems: 'open items',
  exceptionsLimitMultiple: '× limit',
  exceptionsFootnote:
    'Groups sort by age or stall duration descending, never by date created. A project can appear in more than one group — that repetition is the point, not a bug to de-duplicate away.',
  // Fable Brief 003 §4.4 — a sub-threshold update (below the 5-point
  // meaningful-movement rule) does not reset the stall clock, but it
  // should still be visible, so "stalled" reads as distinguishable from
  // "abandoned" without touching the stall rule itself.
  exceptionsLastReportedPrefix: 'Last reported',
 
  // Brief 067 §2 — loadTitle was already nearly v5's exact wording
  // ("Who is carrying what" vs "Who is on what"); updated to match it
  // precisely, unlike exceptionsTitle above (see that key's own
  // comment for the distinction this brief drew).
  loadTitle: 'Who is on what',
  loadKicker: 'Who is on what',
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
  // Fable Brief 003 §4.3 — the per-person panel's empty state previously
  // reused this same generic copy, which read as "nobody is carrying
  // anything" even while the per-stream panel beside it clearly had data.
  // The two panels count different things (open ITEMS with a PIC set vs.
  // open PROJECTS) — this key says so, rather than looking like a broken
  // panel.
  loadEmptyPerPerson:
    'No open items currently have a PIC assigned — different from nobody carrying any work. See the per-stream panel for what is actually open.',
 
  navSales: 'Maintenance clients',
  salesMonitoringTitle: 'Maintenance clients',
  salesMonitoringReadOnlyNote:
    'View only — no create or write action lives on this screen. Contact Project Management to act on anything shown here.',
  salesMonitoringEmpty: 'No maintenance-flagged projects are visible to you yet.',
  salesAssignLinkLabel: 'Assign client owners',
 
  // User management — Brief 012 §2 / Design Note Rev 3 §6. Administration
  // archetype: no age ladder, no card weight, a table not cards (§2.1/2.2).
  navUsers: 'Users',
  usersKicker: 'Administration',
  usersTitle: 'Members',
 
  // §2.4 — the unlinked-account queue, "the most useful thing on this
  // screen." Wording deliberately matches noAccessBody above.
  usersQueueLabel: 'Accounts waiting to be linked',
  usersQueueEmptyFact: 'No accounts are waiting to be linked.',
  usersQueueEmail: 'Signed in as',
  usersQueueTeamLabel: 'Team',
  usersQueueRoleLabel: 'Role',
  usersQueueLinkAction: 'Link account',
  usersQueueLinkPending: 'Linking…',
  usersQueueLinkError: 'Could not link this account. Nothing was changed — try again.',
  usersQueueChooseTeam: 'Choose a team…',
 
  usersColName: 'Name',
  usersColAccount: 'Account',
  usersColTeam: 'Team',
  usersColRole: 'Role',
  usersColStatus: 'Status',
 
  usersRoleMember: 'Member',
  usersRoleManager: 'Manager',
  usersRoleAdmin: 'Admin',
  usersStatusActive: 'Active',
  usersStatusInactive: 'Inactive',
 
  // §2.5/2.6 — deactivate, never delete; the confirmation names the
  // consequence in plain words before the action, not after.
  usersDeactivate: 'Deactivate',
  usersDeactivateCancel: 'Cancel',
  usersDeactivateConfirmAction: 'Yes, deactivate',
  usersDeactivateConfirmPending: 'Deactivating…',
  usersDeactivateConsequenceSignIn: 'This person will no longer be able to sign in.',
  usersDeactivateConsequenceNoPic: 'They are not currently PIC of any project.',
  usersDeactivateConsequencePicSuffix:
    'as PIC — each becomes unassigned and un-updatable by anyone until reassigned.',
  usersDeactivateError: 'Could not deactivate this member. Nothing was changed — try again.',
 
  // §2.7 — restricted, not empty.
  usersRestricted: 'You do not have access to User Management.',
 
  // ADTECH_WF_Brief_013 §3 — the one explicit missing-profile fallback,
  // shown wherever a member is named but no public.user_profiles row
  // exists for them. Never a raw id (see Result 013).
  membersNoProfile: 'No profile on file',
 
  // The unlinked-account queue names a person by email (Brief 012 §2.4);
  // same "never a raw id" rule applies when an account genuinely has none.
  usersQueueNoEmail: 'No email on file',
 
  // ADTECH_WF_Brief_014 §2 — Reactivate. Uses the same members_update
  // permission as Deactivate; no consequence to name, so no two-step
  // confirmation (unlike Deactivate/Unlink below).
  usersReactivate: 'Reactivate',
  usersReactivatePending: 'Reactivating…',
  usersReactivateError: 'Could not reactivate this member. Nothing was changed — try again.',
 
  // §3 — Unlink. Same two-step, consequence-naming pattern as Deactivate
  // (§3.3); reuses usersDeactivateConsequenceNoPic/PicSuffix below for the
  // PIC-count line since the consequence is identical in both cases.
  usersUnlink: 'Unlink',
  usersUnlinkCancel: 'Cancel',
  usersUnlinkConfirmAction: 'Yes, unlink',
  usersUnlinkConfirmPending: 'Unlinking…',
  usersUnlinkConsequenceAccess:
    'This person will no longer be able to sign in. Their account returns to the list waiting to be linked and can be linked again.',
  usersUnlinkError: 'Could not unlink this account. Nothing was changed — try again.',
 
  // §4 — Telegram column. Reads the CMMS's existing link only; this app
  // never writes telegram_username/telegram_chat_id (§4.2/§4.4/§6).
  usersColTelegram: 'Telegram',
  usersTelegramNotLinked: 'Not linked',
  // A real Telegram account can be linked (telegram_chat_id set) without
  // ever having set a public @handle — distinct from "not linked".
  usersTelegramLinkedNoHandle: 'Linked (no @handle set)',
  usersTelegramLinkHint:
    'In the CMMS, generate a Telegram link code for this account, then have them send it to @adtech_cmms_bot.',
 
  // §3 — assigning a PIC, on the board (screen 4a), not here.
  boardAssignPic: 'Assign PIC',
  boardReassignPic: 'Reassign',
  boardAssignPicChoose: 'Choose a PIC…',
  boardAssignPicPending: 'Saving…',
  boardAssignPicError: 'Could not assign this PIC. Nothing was changed — try again.',
 
  // Screen 1a — post a request (Brief 015). Single-task form archetype,
  // same 720px/one-decision-per-block shape as 6a (Design Note Rev 3
  // §4.2). Reached from the header nav by any active member (§4).
  navRequests: 'Post a request',
  // Screen 1c — Triage (Brief 021 §2). Any active member (§1.1).
  navTriage: 'Triage',
 
  requestKicker: 'New request',
  requestTitle: 'Post a request',
 
  requestBodyLabel: 'What’s the request?',
  requestRequired: 'Required',
  requestOptional: '(optional)',
 
  // §2.1/§3.1 — the destination decision: a team, or "I'm not sure" (backs
  // workflow.requests.destination_unsure, a first-class button per that
  // column's own comment in migration 001, not an afterthought link).
  requestDestinationLabel: 'Where should this go?',
  requestDestinationUnsure: 'I’m not sure — route this for me',
  // §3.2 — an empty lookup table renders gracefully as empty rather than
  // a dropdown that cannot be satisfied. Not a blocker here: "I'm not
  // sure" is always available regardless of whether workflow.teams has
  // any active rows.
  requestDestinationEmpty:
    'No teams are set up to route to yet — post as “I’m not sure” and it will be routed for you.',
 
  // §3.1 — client/site/project are all nullable columns, genuinely
  // optional, and folded under one disclosure so the primary path stays
  // two decisions (body, destination) — the closest match to typing a
  // message into Telegram this schema allows.
  requestDetailToggle: 'Add more detail (optional)',
  requestClientLabel: 'Client',
  requestClientChoose: 'Choose a client…',
  requestClientEmpty: 'No clients on file yet.',
  requestSiteLabel: 'Site',
  requestSiteChoose: 'Choose a site…',
  requestSiteChooseClientFirst: 'Choose a client first.',
  requestSiteEmpty: 'No sites on file yet for this client.',
  requestProjectLabel: 'Related project',
  requestProjectChoose: 'Choose a project…',
  requestProjectEmpty: 'No open projects on file yet.',
 
  requestPost: 'Post request',
  requestPosting: 'Posting…',
  requestCancel: 'Cancel',
  requestBlockedTitle: 'Fill in the request and pick where it should go.',
  requestBlockedBody:
    'A body and a destination — even “I’m not sure” — are both needed before this can be posted. No modal, no toast, and the click is never let through to be scolded afterwards.',
  // §6 — Telegram notification (screen 5a) and triage (screen 1c) are
  // both out of scope this round; this hint says plainly what actually
  // happens instead of implying either one.
  requestHint: 'This is saved as a record. Nobody is notified automatically yet.',
  requestConfirmation: 'Request posted — saved as a record. Nobody is notified automatically yet.',
  requestConfirmationDismiss: 'Dismiss',
 
  // Lookup Table Admin (Brief 017). Administration archetype, same as
  // /users — table, not cards, no age ladder, no card weight (§3.1). The
  // vocabulary rows themselves render label_en/label_km straight from the
  // database, never through this dictionary (dictionary.ts's own header
  // note) — everything below is screen CHROME only: titles, column
  // headers, and the edit/add form controls around that data.
  navLookups: 'Lookup tables',
  lookupsKicker: 'Administration',
  lookupsTitle: 'Lookup Tables',
 
  lookupsReasonCodesTitle: 'Reason codes',
  lookupsScopeTypesTitle: 'Scope types',
  lookupsStagesTitle: 'Stages',
 
  lookupsColCode: 'Code',
  lookupsColLabelEn: 'Label (English)',
  lookupsColLabelKm: 'Label (Khmer)',
  lookupsColSortOrder: 'Sort order',
  lookupsColStatus: 'Status',
 
  // §3.6 — a row with English but no real Khmer must be surfaced as
  // needing attention rather than passing silently, even where (like the
  // 8 existing reason_codes) it is already active from before this screen
  // existed.
  lookupsNeedsAttention: 'Needs a real Khmer label',
 
  lookupsEdit: 'Edit',
  lookupsCancel: 'Cancel',
  lookupsSave: 'Save',
  lookupsSaving: 'Saving…',
  lookupsSaveError: 'Could not save this row. Nothing was changed — try again.',
 
  lookupsActiveLabel: 'Active',
  // §3.6 — the activation gate itself, named in plain words beside the
  // control it blocks, same "no modal, no toast" discipline as every
  // other refusal state in this app.
  lookupsActivateBlockedHint:
    'Both a Label (English) and a real Label (Khmer) are required before this row can go active.',
 
  lookupsAddTitle: 'Add new',
  lookupsAddAction: 'Add',
  lookupsAddPending: 'Adding…',
  lookupsAddError: 'Could not add this row. Nothing was saved — try again.',
  // §3.4 — code is immutable after creation; stated here rather than only
  // silently refused later.
  lookupsCodeLabel: 'Code',
  lookupsCodeHint: 'Cannot be changed after this row is created',
  lookupsLabelEnLabel: 'Label (English)',
  lookupsLabelKmLabel: 'Label (Khmer)',
  lookupsLabelKmOptionalHint: 'Optional for now — required before this row can go active',
  lookupsSortOrderLabel: 'Sort order',
 
  // §3.8 — stages is empty right now, and that is the first thing a
  // person sees here. Reads as "nothing defined yet, add the first one",
  // never as a blank or an error.
  lookupsStagesEmpty: 'Nothing defined yet for any scope type. Add the first one below.',
 
  lookupsStageColScopeType: 'Scope type',
  lookupsStageColSequence: 'Sequence',
  lookupsStageColOwnerTeam: 'Owner team',
  lookupsStageColTerminal: 'Terminal',
  lookupsStageScopeTypeChoose: 'Choose a scope type…',
  lookupsStageOwnerTeamChoose: 'Choose a team…',
  // §3.7 — surfaced plainly, not hidden in an advanced section.
  lookupsStageIsTerminalLabel: 'Ends the flow (terminal stage)',
  lookupsStageTerminalYes: 'Yes',
 
  // Screens 2a/2b — the SO spine (Brief 018). Record/detail archetype
  // (2a) and small focused panel archetype (2b), Design Note Rev 3
  // §4.3/§4.4. Both read-only this round (§2.1/§4) — no approve, no
  // edit, no "issue SO number" action lives on either screen.
  navAwaitingSo: 'Awaiting SO',
 
  soRecordNoSoYet: 'No SO number yet',
  soRecordAwaitingSoNote: 'This project has no SO number yet — see the',
  soRecordAwaitingSoNoteSuffix: 'queue.',
  soRecordPicLabel: 'PIC',
 
  soRecordStageStripTitle: 'Stage strip',
  soRecordStageStripNoScopeType: 'No scope type is set for this project yet.',
  soRecordStageStripEmpty:
    'No stages are defined yet for this scope type — set them up in Lookup Table Admin.',
 
  soRecordVariationsTitle: 'Variation lines',
  soRecordVariationsCaption: 'nested under this SO · never their own SO number',
  soRecordVariationsEmpty: 'No variations recorded against this SO.',
  soRecordColDescription: 'Description',
  soRecordColCommitted: 'Committed',
  soRecordColApproval: 'Approval',
  // §2.2 — the hard split's own callout. Wording kept generic rather than
  // reusing the mockup's specific fixture story (a named PO/actuator
  // example) — that flavour text belongs to the sample data, not to this
  // app's permanent chrome.
  soRecordAtRiskBannerKicker: 'Money at risk',
  soRecordAtRiskBannerBody:
    'Already committed against variations not yet approved. If any is declined, this exposure remains:',
  soRecordAtRisk: 'At risk',
  soRecordApproved: 'Approved',
  soRecordNotApproved: 'Not approved',
 
  soRecordLinkedRequestsTitle: 'Linked requests',
  soRecordLinkedRequestsEmpty: 'No open requests linked to this project.',
  soRecordLinkedProcurementTitle: 'Linked procurement',
  soRecordLinkedProcurementEmpty: 'No procurement lines recorded yet.',
  soRecordProcurementPoIssued: 'PO issued',
  soRecordProcurementDelivered: 'Delivered in full',
  soRecordProcurementSourcing: 'Sourcing, no PO yet',
 
  // Screen 2c (Brief 019) — two bands, two clocks, per §2. See
  // src/app/(app)/projects/[projectId]/procurement/page.tsx's own comment
  // for the data-model gaps this screen reports rather than invents
  // around (no per-line name, no floor reference, no per-line owner).
  procurementLineKicker: 'Procurement',
  procurementLineBackLink: 'Back to SO record',
  procurementLineFloorGapNote:
    'This project tracks individual floors, but procurement lines are not yet linked to a floor — every line below applies to the project as a whole.',
  procurementLineSectionTitle: 'Procurement lines',
  procurementLineEmpty: 'No procurement lines recorded yet for this project.',
  procurementLineWriteNote: 'Only an active member of the Procurement team can add or update these lines.',
  procurementLineOrdinalPrefix: 'Procurement line',
  procurementLineSourcingBand: 'Sourcing',
  procurementLineSourcingNotStarted: 'Not started yet',
  procurementLineSinceSourcingStarted: 'since sourcing started',
  procurementLinePoBand: 'PO',
  procurementLineMrNotSubmitted: 'MR not yet submitted',
  procurementLineMrAwaitingApproval: 'MR submitted, awaiting approval',
  procurementLineMrApprovedAfter: 'MR approved after',
  procurementLineSinceMrApproved: 'since MR approved',
  procurementLinePoIssued: 'PO issued',
  procurementLinePoNotYetIssued: 'PO not yet issued',
  procurementLineDeliveryLabel: 'Delivery',
  procurementLineDeliveredCount: 'delivered',
  procurementLineDeliveryNotTracked: 'Not tracked',
  procurementLineCustomsLabel: 'Logistics / customs',
  procurementLineCustomsNone: 'No status recorded yet',
  soRecordViewProcurement: 'View procurement lines',
  soRecordLinkedDependencyChainTitle: 'Dependency chain',
  soRecordLinkedDependencyChainEmpty: 'No dependency chain recorded yet.',
  soRecordDependencyChainSlipped: 'Slip carried to chain end',
  soRecordDependencyChainOnTrack: 'No slip accumulated',
  soRecordViewDependencyChain: 'View dependency chain',
  // Brief 046 / Amendment A — the fourth so-record panel, added once a
  // real Contract BOQ entry screen existed to link to.
  soRecordLinkedContractBoqTitle: 'Contract BOQ',
  soRecordLinkedContractBoqEmpty: 'No Contract BOQ lines recorded yet.',
  soRecordViewContractBoq: 'View Contract BOQ',
  // Brief 047 — the fifth so-record panel.
  soRecordLinkedFloorsTitle: 'Floors',
  soRecordLinkedFloorsEmpty: 'No floors configured yet.',
  soRecordViewFloors: 'Configure floors',
  // Brief 055 — the sixth so-record panel.
  soRecordLinkedShopDrawingBoqTitle: 'Shop Drawing BOQ',
  soRecordLinkedShopDrawingBoqEmpty: 'No Shop Drawing BOQ lines recorded yet.',
  soRecordViewShopDrawingBoq: 'View Shop Drawing BOQ',
  // Brief 056 — the floor x sub-stage colour matrix, ?view=matrix on 2a.
  soRecordViewMatrix: 'View matrix',
  floorMatrixKicker: 'Floor x sub-stage matrix',
  floorMatrixBackToSoRecord: 'Back to SO record',
  floorMatrixEmptyNoFloors: 'No floors configured yet.',
  floorMatrixFloorColumnHeader: 'Floor',
  floorMatrixLegendTitle: 'Legend',
  floorMatrixLegendNotApplicable: 'Not applicable',
  floorMatrixLegendNotStarted: 'Not started',
  floorMatrixLegendInProgress: 'In progress',
  floorMatrixLegendAwaitingQc: 'Complete, awaiting QC',
  floorMatrixLegendQcPassed: 'QC passed / done',
  floorMatrixLegendStalled: 'Stalled (16+ days)',

  // Screen 2d (Brief 023) — the dependency chain, days taken against days
  // allowed per link. See
  // src/app/(app)/projects/[projectId]/dependencies/page.tsx's own comment
  // for the schema findings this screen reports rather than invents
  // around (no per-link owner column; no target/planned handover date, so
  // slip is shown as an accumulated day count, never a pushed calendar
  // date).
  dependencyChainKicker: 'Dependency chain',
  dependencyChainBackLink: 'Back to SO record',
  dependencyChainOwnerGapNote:
    'Each link has no owner of its own recorded in the database — the project PIC below is shown for identification only, not as who is holding this link.',
  dependencyChainSectionTitle: 'Chain',
  dependencyChainEmpty: 'No dependency chain recorded yet for this project.',
  dependencyChainSequencePrefix: 'Link',
  dependencyChainNotStarted: 'Not started yet',
  dependencyChainInProgress: 'In progress',
  dependencyChainDone: 'Done',
  dependencyChainStartedLabel: 'Started',
  dependencyChainEndedLabel: 'Ended',
  dependencyChainDaysTakenLabel: 'taken',
  dependencyChainDaysAllowedLabel: 'allowed',
  dependencyChainNoAllowance: 'No allowance set for this link',
  dependencyChainOverrunTag: 'over',
  dependencyChainUpstreamSlip: 'carried in from upstream',
  dependencyChainSlipTitle: 'Cumulative slip carried to the end of the chain',
  dependencyChainSlipNone: 'No slip accumulated across the chain yet.',
  dependencyChainSlipInto: 'as of',
  dependencyChainNoDateNote:
    'No target or planned date is recorded anywhere in the schema for this project, so only the accumulated day count can be shown here — not a pushed calendar date.',
  dependencyChainWriteNote:
    'Read-only. Setting day allowances, recording start/end dates, and marking links complete are not available on this screen yet.',
 
  // Screen 3a — catalogue item (Brief 026). Small-focused-panel archetype,
  // Design Note Rev 3 §4.4, 700px. workflow.catalogue_items/
  // catalogue_events already existed (migration 001, theme 3's own tables,
  // built ahead of any UI) — see the detail page's own comment for the
  // mockup-vs-schema gaps reported rather than invented around (no
  // manufacturer-country/HS-code fields, no successor price/lead-time, no
  // "where it's referenced" panel, no write actions — no INSERT/UPDATE
  // policy exists yet on either table).
  navCatalogue: 'Catalogue',
  catalogueIndexKicker: 'Catalogue',
  catalogueIndexTitle: 'Product catalogue',
  catalogueIndexEmpty: 'No catalogue items recorded yet.',
  catalogueIndexColManufacturer: 'Manufacturer',
  catalogueIndexColPartNumber: 'Part number',
  catalogueIndexColStatus: 'Status',
  catalogueItemKicker: 'Catalogue',
  catalogueItemBackLink: 'Back to catalogue',
  catalogueItemManufacturerLabel: 'Manufacturer',
  // The four fixed lifecycle steps, read verbatim from the mockup markup
  // (div id="3a") per the brief's own instruction not to invent labels —
  // hardcoded here the same way age.ts's four bands are, NOT a /lookups
  // table: workflow.catalogue_items.lifecycle_step is CHECK-constrained
  // to exactly 1-4, the schema's own fixed classification, not an
  // open-ended admin-editable vocabulary like workflow.stages.
  catalogueLifecycleStep1: 'Preferred',
  catalogueLifecycleStep2: 'Approved',
  catalogueLifecycleStep3: 'Use with caution',
  catalogueLifecycleStep4: 'Do not quote',
  catalogueItemReasonLabel: 'Reason',
  catalogueItemReasonNone: 'No reason recorded for the current status.',
  catalogueItemSuccessorTitle: 'Successor part',
  catalogueItemSuccessorNone: 'No successor on file.',
  catalogueItemVerifiedTitle: 'Last verified',
  catalogueItemVerifiedNever: 'Never verified.',
  catalogueItemVerifiedBy: 'by',
  catalogueItemStalenessLabel: 'days ago',
  catalogueItemHistoryTitle: 'Status history',
  catalogueItemHistoryEmpty: 'No status changes recorded yet.',
  catalogueItemWriteNote:
    'Read-only. Confirming the current status or changing it are not available on this screen yet.',
  // §1's own gap, stated once on screen rather than per-field: fields the
  // mockup shows that no column backs (origin/distributor, HS code,
  // successor price and lead time, and any "where this is referenced"
  // list — procurement_lines carries no catalogue_item_id and no tender
  // table exists).
  catalogueItemGapNote:
    "This screen shows every field the database actually holds for this item. The mockup's origin/distributor and HS-code fields, the successor's price and lead time, and a \"where it's referenced\" list are not backed by any column yet and are left out rather than invented.",

  // Screen 3b — warning at point of use (Brief 027). A reusable,
  // standalone component (src/components/WarningAtPointOfUse.tsx) — the
  // real host (a tender line being priced) is genuinely blocked on
  // process discovery (§1), so these keys are demonstrated on 3a's own
  // page rather than on an invented tender screen. See that component's
  // own comment.
  warningAtUseBadge: 'Status warning',
  warningAtUseReplacedBy: 'Replaced by',
  warningAtUseSwapAction: 'Swap to',
  warningAtUsePriceAnyway: 'Price it anyway',
  warningAtUseAskProcurement: 'Ask Procurement',
  warningAtUseMicrocopy:
    'Choosing price it anyway records the decision on the tender line, so the reason exists later. It does not ask you to justify it now.',
  warningAtUseStalenessBadge: 'Staleness',
  warningAtUseStalenessAgo: 'days ago',
  warningAtUseStalenessBody: 'Verify the price and lead time before submitting.',
  warningAtUseAskProcurementVerify: 'Ask Procurement to verify',
  warningAtUseDemoLabel: 'Preview — how this warning appears at the point of use',
  warningAtUseDemoNote:
    'This is a demonstration, not a live warning. The real trigger point — pricing a tender line — does not exist in this app yet; tender internals remain blocked on process discovery. The actions below are inert here, ready to wire up once a real host exists.',

  // Screen 3c — phone, two frames (Brief 028). Its own archetype, NOT a
  // shrunken desktop screen (§2's own instruction). See each route's own
  // comment for the real blockers found and how each was handled.
  phoneStatusKicker: 'Status',
  phoneStatusHeldByLabel: 'Held by',
  phoneStatusInStateLabel: 'in this state',
  phoneStatusTotalAgeLabel: 'total age',
  phoneStatusRecentActivityTitle: 'Recent activity',
  phoneStatusNoLegs: 'No handoffs yet — still with the original owner.',
  phoneStatusNudgeAction: 'Nudge',
  phoneStatusNudgeUnavailableNote:
    "Sending a Telegram nudge isn't wired up in this app yet — see Brief 029's Result.",
  phoneStatusOpenFullDetail: 'Open full detail',

  phoneApproveKicker: 'Approval needed',
  phoneApproveOrdinalPrefix: 'Variation',
  phoneApproveRaisedBy: 'raised by',
  phoneApproveValueLabel: 'Value',
  phoneApproveWaitingLabel: 'waiting',
  phoneApproveAlreadyApproved: 'Already approved',
  phoneApproveApprovedOn: 'Approved',
  phoneApproveAction: 'Approve',
  phoneApproveDeclineAction: 'Decline',
  phoneApproveAskQuestionAction: 'Ask a question',
  phoneApproveBlockedNote:
    "These actions aren't available yet. There is no write permission in the database for approving a variation, no decline state is modelled, and asking a question has no reply mechanism — flagged for a future brief rather than built on a guess.",
  phoneApproveOpenFullDetail: 'Open SO record',

  // Screen 5a — Telegram message spec (Brief 029). A reference/preview
  // page, not a live send — see /notifications and src/lib/telegram/
  // messages.ts's own comments for what is and is not built this round.
  navNotifications: 'Telegram messages',
  notificationsKicker: 'Reference',
  notificationsTitle: 'Telegram message spec',
  notificationsIntro:
    'Six messages and nothing else — every trigger, audience, and the exact text and buttons each one sends. This page is a reference, not a live feed: none of these have ever actually been sent (see the note below each blocked one) and no button here is live.',
  notificationsTriggerLabel: 'Trigger',
  notificationsAudienceLabel: 'Audience',
  notificationsButtonsLabel: 'Buttons',
  notificationsBlockedBadge: 'Cannot fire yet',
  notificationsSendGapNote:
    "This app has no configured way to actually send any of these yet — no TELEGRAM_BOT_TOKEN, and no wiring from a real event (a request posted, a bounce, an escalation) into a send call. That is a deployment and architecture decision, not made here. See the Result doc for the full account.",
  // §3.1/§3.3 — the queue, and its own empty state read as good news
  // (Design Note §4.9's "empty states drawn as results" rule).
  awaitingSoKicker: 'The SO spine',
  awaitingSoTitle: 'Awaiting SO',
  awaitingSoEmptyFact: 'No projects are waiting on an SO number right now.',
  awaitingSoRestrictedNotice:
    'Sales-team access is restricted to maintenance-flagged projects under clients you own — this may not be every project awaiting an SO.',
  awaitingSoRestrictedEmpty:
    'No maintenance-flagged projects under a client you own are awaiting an SO — this is not the same as "none app-wide."',
  awaitingSoAccountable: 'Accountable',
  awaitingSoSinceWon: 'since won',
  // §3.1 — pre-SO activity given somewhere legitimate to live; the one
  // line backed by a real column (procurement_lines.sourcing_started_at).
  awaitingSoSourcingNotePrefix: 'Sourcing already started —',
  awaitingSoSourcingNoteSuffix: 'procurement line(s) in progress.',
  awaitingSoCommitmentBlockedNote: 'Commitment (MR/PO) stays blocked until this project has an SO number.',
  awaitingSoViewRecord: 'View SO record',
 
  // Screen 6a's floor breakdown + QC recording (Brief 024). Sub-stage,
  // drawing-type, and handover-deliverable labels are fixed CHECK-
  // constraint vocabulary (migration 008), not lookup-table content, so
  // they are hardcoded here rather than sourced from a table — unlike
  // team codes and reason codes, which never go through this dictionary.
  floorBreakdownExpand: 'Floor breakdown',
  floorBreakdownCollapse: 'Hide floor breakdown',
  floorBreakdownCalculated: 'Calculated',
  floorBreakdownOverride: 'Override',
  floorBreakdownOverrideActive: 'Overridden',
  floorBreakdownOverrideCancel: 'Cancel override',
  // Brief 050 §B — replaces the removed inline "Add floor" form; points
  // to the real floor/tower configuration screen (Brief 047) instead.
  floorBreakdownGoToFloorConfig: 'Add or manage floors →',
  floorBreakdownProjectLevelTitle: 'Project-level shop drawing',
  floorBreakdownNoFloors: 'No floors added yet.',
  floorBreakdownShopDrawingTitle: 'Shop drawing',
  floorBreakdownInstallationTitle: 'Installation',
  floorBreakdownTncTitle: 'TNC',
  floorBreakdownHandoverTitle: 'Handover checklist',
  // Migration 022 / Brief 050 §C — shown only when NONE of the relevant
  // gates apply (PIC, QC, Project, TNC team) — the old PIC-only wording
  // would now be inaccurate for a team member who isn't the PIC.
  floorBreakdownPicOnlyNote:
    'You can view floor detail here, but changing it needs to be this project’s PIC or a member of the relevant team (Project, TNC, or QC).',
  floorBreakdownExceptionsTitle: 'QC exceptions',
  floorBreakdownExceptionsEmpty: 'No sub-stage is marked done without a passed inspection.',
  floorBreakdownExceptionFlag: 'No passed inspection',
  floorBreakdownRecordInspection: 'Record inspection',
  floorBreakdownRecordInspectionCancel: 'Cancel',
  floorBreakdownInspectionStatus: 'Result',
  floorBreakdownInspectionNotes: 'Notes',
  floorBreakdownInspectionNotesOptional: '(optional)',
  floorBreakdownInspectionSave: 'Save inspection',
  floorBreakdownInspectionQcOnlyNote: 'Only an active member of the QC team can record an inspection.',
  floorBreakdownMaterialInspectionTitle: 'Material inspection',
  floorBreakdownMaterialInspectionFloors: 'Floors this shipment serves',
  floorBreakdownLastInspection: 'Last inspection',
  floorBreakdownNoInspectionYet: 'No inspection recorded yet',

  // Brief 059 — photo evidence required to mark a floor sub-stage done.
  floorBreakdownSubStagePhotoConfirm: 'Confirm done',
  floorBreakdownSubStagePhotoAlt: 'Sub-stage completion photo evidence',

  drawingTypeSchematic: 'System schematic',
  drawingTypeTypicalSection: 'Section / typical drawing',
  drawingTypeLayout: 'Layout drawing',
  drawingTypeDetailConnection: 'Detail connection',
 
  subStageFirstFix: 'First fix — cable containment',
  subStageSecondFix: 'Second fix — cabling',
  subStageThirdFix: 'Third fix — devices & head-end',
  subStagePreCommissioning: 'Pre-commissioning',
  subStageCommissioning: 'Commissioning',
 
  handoverMaterialApproval: 'Material approval',
  handoverFinalBomSpares: 'Final BOM and spare parts list',
  handoverTcDocument: 'T&C document',
  handoverAsBuiltDrawing: 'As-built drawing',
  handoverTrainingOmManual: 'Training and O&M manual',
  handoverWarrantyDocuments: 'Warranty documents',
 
  statusNotStarted: 'Not started',
  statusInProgress: 'In progress',
  statusDone: 'Done',
 
  inspectionStatusPass: 'Pass',
  inspectionStatusFail: 'Fail',
  inspectionStatusPending: 'Pending',
 
  // Screen 1c — Triage (Brief 021 §2). Small focused panel archetype,
  // Design Note Rev 3 §4.4. Runs its clock in HOURS, not days (§2.2) —
  // the one screen in the app that does not use the day ladder.
  triageKicker: 'The daily request loop',
  triageTitle: 'Triage',
  triageEmptyFact: 'Nothing is waiting on a team — everything posted has been routed.',
  triageHoursSuffix: 'h',
  triageSinceOpened: 'since posted',
  triageRouteChoose: 'Choose a team',
  triageRoute: 'Route',
  triageRoutePending: 'Routing…',
 
  // Screen 1e — Request Detail (Brief 021 §3). Record/detail archetype,
  // Design Note Rev 3 §4.3. Two clocks that disagree on purpose (§3.1);
  // the handoff history is the point of the screen (§3.2); the approval
  // chain stays amber-hatched (§3.3, workflow.approval_steps is empty by
  // design pending stakeholder discovery).
  requestDetailKicker: 'Request',
  requestDetailClosedBadge: 'Closed',
  requestDetailUnsureBadge: "Not sure — awaiting triage",
  requestDetailRequestedBy: 'Requested by',
  requestDetailOwnerLabel: 'Current owner',
  requestDetailTotalAge: 'Total age — since opened',
  requestDetailAgeInCurrentState: 'Age in current state — since this handoff leg began',
  requestDetailDaySuffix: 'd',
  requestDetailHandoffHistoryTitle: 'Handoff history',
  requestDetailHandoffHistoryEmpty: 'Not yet claimed — no handoff has been recorded.',
  requestDetailHandoffFromNone: 'Triage',
  requestDetailApprovalChainTitle: 'Approval chain',
  requestDetailApprovalChainHatched:
    'Not yet defined — pending stakeholder discovery on the approval model.',
  requestDetailHandOffLabel: 'Hand it on',
  requestDetailHandOffChoose: 'Choose a person',
  requestDetailHandOff: 'Hand on',
  requestDetailHandOffPending: 'Handing on…',
  requestDetailClose: 'Close request',
  requestDetailClosePending: 'Closing…',

  // Contract BOQ entry (Brief 046 / Amendment A) — record/detail archetype
  // list, mirroring the users/lookups admin-table shape. PIC-only writes
  // (migration 020); !isPic renders every control disabled/hidden rather
  // than hiding the screen, same convention as update/page.tsx's own
  // isCurrentUserPic gate.
  contractBoqKicker: 'Contract BOQ',
  contractBoqBackToSoRecord: 'Back to SO record',
  contractBoqNotPicNote: 'Only this project’s PIC can add or change Contract BOQ lines here.',
  contractBoqEmpty: 'No Contract BOQ lines yet.',
  contractBoqOptional: '(optional)',
  contractBoqColSection: 'Section',
  contractBoqColDescription: 'Description',
  contractBoqColBrand: 'Brand',
  contractBoqColUnit: 'Unit',
  contractBoqColQuantity: 'Quantity',
  contractBoqColRequested: 'Requested',
  contractBoqAddSubmit: 'Add line',
  contractBoqEdit: 'Edit',
  contractBoqSave: 'Save',
  contractBoqSaving: 'Saving…',
  contractBoqCancel: 'Cancel',
  contractBoqDelete: 'Delete',
  contractBoqDeleteConfirm: 'Delete this Contract BOQ line? This cannot be undone.',
  contractBoqDeleteConfirmAction: 'Yes, delete',
  contractBoqDeleteConfirmPending: 'Deleting…',
  contractBoqLocationsExpand: 'Locations',
  contractBoqLocationsCollapse: 'Hide locations',
  contractBoqLocationsTitle: 'Location breakdown',
  contractBoqLocationsEmpty: 'No location breakdown recorded for this line yet.',
  contractBoqLocationLabel: 'Location',
  contractBoqLocationQuantity: 'Quantity',
  contractBoqLocationAdd: 'Add location',
  contractBoqLocationDelete: 'Remove',

  // Contract BOQ Excel import (Brief 048) — additive only, PIC-gated
  // (same requireProjectPic() pattern). Writes only the flat total
  // quantity to contract_boq_lines; contract_boq_line_locations is
  // deliberately untouched by this importer.
  contractBoqGoToImport: 'Import from Excel',
  contractBoqImportKicker: 'Import Contract BOQ',
  contractBoqImportBackToList: 'Back to Contract BOQ',
  contractBoqImportDownloadTemplate: 'Download template',
  contractBoqImportFileLabel: 'File (.xlsx)',
  contractBoqImportSubmit: 'Import',
  contractBoqImportSubmitting: 'Importing…',
  contractBoqImportSuccessPrefix: 'Imported',
  contractBoqImportSuccessSuffix: 'line(s).',
  contractBoqImportRejected: 'Nothing was imported — fix these and try again:',

  // Floor & Zone (Tower/Wing) Configuration (Brief 047) — PIC-only writes
  // (migration 021's project_towers policies; project_floors' own
  // existing migration-009 policies, unchanged). !isPic renders every
  // control disabled/hidden, same convention as contract-boq and update.
  floorConfigKicker: 'Floor & zone configuration',
  floorConfigBackToSoRecord: 'Back to SO record',
  floorConfigNotPicNote: 'Only this project’s PIC can add or change floor/tower configuration here.',
  floorConfigEmpty: 'No towers or floors configured yet.',
  floorConfigNoFloorsHere: 'No floors here yet.',
  floorConfigNoTower: 'No tower',
  floorConfigTower: 'Tower',
  floorConfigLabel: 'Label',
  floorConfigOrder: 'Order',
  floorConfigEdit: 'Edit',
  floorConfigSave: 'Save',
  floorConfigSaving: 'Saving…',
  floorConfigCancel: 'Cancel',
  floorConfigDeleting: 'Removing…',
  floorConfigDeleteConfirmAction: 'Yes, remove',
  floorConfigTowerLabel: 'Tower label',
  floorConfigTowerPlaceholder: 'e.g. Tower 1',
  floorConfigAddTowerTitle: 'Add a tower or wing',
  floorConfigAddTowerSubmit: 'Add tower',
  floorConfigDeleteTower: 'Delete tower',
  floorConfigDeleteTowerConfirm: 'Delete this tower? Its floors must be reassigned or removed first.',
  floorConfigFloorPlaceholder: 'e.g. L1, B2, Podium',
  floorConfigAddFloorSubmit: 'Add floor',
  floorConfigDeleteFloor: 'Delete floor',
  floorConfigDeleteFloorConfirm: 'Delete this floor? This cannot be undone.',
  // Brief 058 — entry point into the print-labels screen below.
  floorConfigPrintLabels: 'Print floor QR labels',

  // Brief 058 — QR labels, one per floor, printed and stuck up on site.
  floorLabelsKicker: 'Floor QR labels',
  floorLabelsBackToFloorConfig: 'Back to floor & zone configuration',
  floorLabelsEmpty: 'No floors configured yet — add floors first.',
  floorLabelsIntro: 'Scanning a label lands on that floor’s sub-stage panel on the update screen.',
  floorLabelsSizeLabel: 'Label size',
  floorLabelsModuleSizeSuffix: '/module',
  floorLabelsPrintButton: 'Print',

  // Shop Drawing BOQ (Brief 055) — list/view screen, team-gated (Shop
  // Drawing or A&A team, migration 022 §3), not PIC-gated. Reused across
  // both the list and import pages, same as contractBoqNotPicNote is.
  shopDrawingBoqKicker: 'Shop Drawing BOQ',
  shopDrawingBoqBackToSoRecord: 'Back to SO record',
  shopDrawingBoqNotTeamNote: 'Only the Shop Drawing or A&A team can import lines here.',
  shopDrawingBoqEmpty: 'No Shop Drawing BOQ lines yet.',
  shopDrawingBoqGoToImport: 'Import from Excel',
  shopDrawingBoqColSystemType: 'System Type',
  shopDrawingBoqColDescription: 'Description',
  shopDrawingBoqColBrand: 'Brand',
  shopDrawingBoqColModelPartNumber: 'Model / Part Number',
  shopDrawingBoqColUnit: 'Unit',
  shopDrawingBoqColQuantity: 'Quantity',
  shopDrawingBoqColRequested: 'Requested',

  // Shop Drawing BOQ grouped views (Brief 049) — Contract BOQ does NOT get
  // this treatment this round (confirmed with Seanghakk: no system_type
  // column, no floor breakdown at all — see grouped-views.ts's own
  // header). "By tower"/"by floor" are built from the real per-floor
  // breakdown (shop_drawing_boq_line_locations), not from a line's own
  // total_quantity.
  shopDrawingBoqViewLabel: 'View',
  shopDrawingBoqViewFlat: 'Flat list',
  shopDrawingBoqViewSystem: 'By system',
  shopDrawingBoqViewTower: 'By tower',
  shopDrawingBoqViewFloor: 'By floor',
  shopDrawingBoqGroupColSystem: 'System',
  shopDrawingBoqGroupColLineCount: 'Lines',
  shopDrawingBoqGroupColTower: 'Tower',
  shopDrawingBoqGroupColFloor: 'Floor',
  shopDrawingBoqGroupColEntries: 'Entries',
  shopDrawingBoqFloorsNotConfigured: 'No floors or towers configured for this project yet.',
  shopDrawingBoqGoToFloorConfig: 'Configure floors',
  // A line can carry a total_quantity with ZERO floor breakdown recorded
  // (Brief 049's own "never silently dropped" requirement) — shown as a
  // plain sentence, not a table row, since it deliberately has no
  // tower/floor to sit under.
  shopDrawingBoqNoBreakdownPrefix: 'Also',
  shopDrawingBoqNoBreakdownSuffix: 'line(s) with no floor breakdown recorded, totalling',

  // Shop Drawing BOQ Excel import (Brief 055) — additive only, team-gated
  // (same requireTeam() pattern as update/floor-actions.ts). Writes
  // shop_drawing_boq_lines plus, for each non-empty floor/zone column,
  // one shop_drawing_boq_line_locations row resolved to a real floor_id.
  shopDrawingBoqImportKicker: 'Import Shop Drawing BOQ',
  shopDrawingBoqImportBackToList: 'Back to Shop Drawing BOQ',
  shopDrawingBoqImportDownloadTemplate: 'Download template',
  shopDrawingBoqImportFileLabel: 'File (.xlsx)',
  shopDrawingBoqImportSubmit: 'Import',
  shopDrawingBoqImportSubmitting: 'Importing…',
  shopDrawingBoqImportSuccessPrefix: 'Imported',
  shopDrawingBoqImportSuccessSuffix: 'line(s).',
  shopDrawingBoqImportRejected: 'Nothing was imported — fix these and try again:',
} as const
 
export type DictionaryKey = keyof typeof en
 
const km: Record<DictionaryKey, string> = { ...en }
 
export const dictionaries: Record<Lang, Record<DictionaryKey, string>> = { en, km }
 
