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
  floorBreakdownAddFloor: 'Add floor',
  floorBreakdownFloorLabel: 'Floor label',
  floorBreakdownFloorLabelPlaceholder: 'e.g. B1, Roof, 12',
  floorBreakdownAddFloorSubmit: 'Add',
  floorBreakdownProjectLevelTitle: 'Project-level shop drawing',
  floorBreakdownNoFloors: 'No floors added yet.',
  floorBreakdownShopDrawingTitle: 'Shop drawing',
  floorBreakdownInstallationTitle: 'Installation',
  floorBreakdownTncTitle: 'TNC',
  floorBreakdownHandoverTitle: 'Handover checklist',
  floorBreakdownPicOnlyNote: 'Only this project’s PIC can change floor detail here.',
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
} as const

export type DictionaryKey = keyof typeof en

const km: Record<DictionaryKey, string> = { ...en }

export const dictionaries: Record<Lang, Record<DictionaryKey, string>> = { en, km }
