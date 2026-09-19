/**
 * Screen 5a — Telegram message spec (Brief 029). Six messages and
 * nothing else, read verbatim from the mockup's own chat-thread markup
 * (div id="5a"), not invented from the README's generic description.
 *
 * NOT GREENFIELD, BUT NOT DIRECTLY REACHABLE EITHER (§1's own two-way
 * fork, neither branch of which matches reality exactly) — checked
 * directly, both repos:
 *   - adtech-workflow (this app) has ONLY the read side of Telegram
 *     linking: public.user_profiles.telegram_username/telegram_chat_id/
 *     telegram_linked_at, populated by the CMMS's own /start flow. No
 *     send function, no bot token, no webhook exists anywhere in this
 *     repo (grepped directly).
 *   - ~/Documents/adtech-cmms DOES send real messages — src/lib/
 *     telegram.ts, a plain fetch to the Bot API using its own
 *     process.env.TELEGRAM_BOT_TOKEN — but that is CMMS-internal
 *     Next.js server code, not shared infrastructure (no Supabase Edge
 *     Function, no cross-app outbox table) this app can call into
 *     without its own copy of that token.
 * So: this is not "send capability doesn't exist" (§1's greenfield
 * branch), but it is also not "wiring into what already works" in one
 * step — this app would need its OWN TELEGRAM_BOT_TOKEN (same bot,
 * @adtech_cmms_bot, since the linking flow is already shared) before
 * send.ts below can do anything. That is a deployment/secrets decision,
 * not something this session can set. See the Result doc for the full
 * account and what is and is not built this round.
 *
 * TONE/STRUCTURE, borrowed from the CMMS's own src/lib/telegram.ts
 * (§2's own instruction to read it directly): bold header line, a
 * divider, bold detail line(s), then plain lines, HTML-escaped via esc()
 * exactly the same way — every interpolated value here is equally
 * attacker-controllable (a request body, a variation description) and
 * lands in a message rendered with parse_mode: HTML.
 *
 * DELIBERATE DEPARTURE FROM THE CMMS'S OWN TEMPLATES: no Khmer line.
 * The CMMS's messages carry a real Khmer sentence in every template;
 * this app's own dictionary is explicit that NO real Khmer translation
 * exists yet anywhere in this app (src/lib/i18n/dictionary.ts's own
 * header comment) and writing one here — untranslated by a native
 * speaker, for text that leaves the app entirely into a chat thread —
 * would be a worse version of exactly the mistake that comment warns
 * against. English only until that pass happens.
 */

import { formatUsd0 } from '@/lib/format/money'

export type InlineButton = { text: string; url: string }
export type NotificationCopy = { message: string; buttons?: InlineButton[][] }

// Mirrors the CMMS's own pattern (src/lib/telegram.ts) — read from the
// app's own configured URL, falling back to localhost for anywhere this
// runs without one configured yet (this app has no NEXT_PUBLIC_APP_URL
// today; grepped directly — another small gap this round surfaces
// without inventing a value for it).
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** §2 rule 3 — "at most two buttons, both deep-linking into the app."
 *  Read strictly: both must be a real {text, url} deep link, never a
 *  callback_data button (the CMMS's own P1-alarm/Snooze buttons use
 *  callback_data, handled by its own webhook — this app has no webhook
 *  at all, confirmed by grep, so nothing here uses that shape). Several
 *  of the six sample messages in the mockup show a second action (e.g.
 *  "I'll take it," "Reassign") that has no one-tap deep-linkable route
 *  in this app today — claiming a request or reassigning it both
 *  require picking a person from HandOffForm's own dropdown, not a
 *  single URL. Rather than invent a new one-tap route to manufacture a
 *  second button, those messages carry one button only — rule 3 says
 *  "at most two," not "exactly two." */

// -----------------------------------------------------------------------
// 1. Request posted -> destination team group
// -----------------------------------------------------------------------
export function buildRequestPosted(req: { id: string; body: string; requesterName: string }): NotificationCopy {
  const message = [
    `📥 <b>NEW REQUEST</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<b>${esc(req.body)}</b>`,
    `👤 ${esc(req.requesterName)} · 0d`,
  ].join('\n')

  return {
    message,
    buttons: [[{ text: '🔗 Open in tracker', url: `${APP}/requests/${req.id}` }]],
  }
}

// -----------------------------------------------------------------------
// 2. Untriaged, unpicked 4h -> triage owner
//
// AUDIENCE GENUINELY UNRESOLVED, flagged rather than guessed: Brief 021
// §1.1 is explicit that triage has no single owner — "any active member"
// triages. There is no "triage owner" account, role, or team anywhere in
// this schema to resolve this message's own stated audience against.
// This template still exists (built per §2's "do not invent message
// types beyond what's in the mockup" — omitting one is not the fix
// either), but nothing in this app can currently pick a real recipient
// for it. See the Result doc.
// -----------------------------------------------------------------------
export function buildTriageUnpicked(req: { id: string; body: string; hoursOpen: number }): NotificationCopy {
  const message = [
    `⏳ <b>UNTRIAGED · ${req.hoursOpen}H</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<b>${esc(req.body)}</b>`,
    `Nobody has picked this up yet.`,
  ].join('\n')

  return {
    message,
    buttons: [[{ text: '🔗 Open in tracker', url: `${APP}/triage` }]],
  }
}

// -----------------------------------------------------------------------
// 3. Bounced for clarification -> the requester, direct
// -----------------------------------------------------------------------
export function buildRequestBounced(req: {
  id: string
  body: string
  fromName: string
  totalAgeDays: number
}): NotificationCopy {
  const message = [
    `↩️ <b>SENT BACK FOR CLARIFICATION</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<b>${esc(req.body)}</b>`,
    `👤 ${esc(req.fromName)} · ${req.totalAgeDays}d`,
  ].join('\n')

  return {
    message,
    buttons: [[{ text: '✏️ Answer in tracker', url: `${APP}/requests/${req.id}` }]],
  }
}

// -----------------------------------------------------------------------
// 4. Needed-by passed -> the holder, direct
//
// GENUINELY BLOCKED, not just unresolved: no needed_by/due-date column
// exists anywhere on workflow.requests (checked directly — the same gap
// Brief 028's own status frame hits from the read side). This trigger
// can never fire against the real schema as it stands. Template built
// for completeness per §2's "do not invent beyond the mockup, but do
// cover all six"; it has no caller anywhere and cannot have one yet.
// -----------------------------------------------------------------------
export function buildNeededByPassed(req: {
  id: string
  body: string
  holderName: string
  totalAgeDays: number
  daysInState: number
}): NotificationCopy {
  const message = [
    `🔴 <b>NEEDED-BY PASSED</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<b>${esc(req.body)}</b>`,
    `👤 ${esc(req.holderName)} · Total age ${req.totalAgeDays}d / With you ${req.daysInState}d`,
  ].join('\n')

  return {
    message,
    buttons: [[{ text: '🔗 Open in tracker', url: `${APP}/requests/${req.id}/status` }]],
  }
}

// -----------------------------------------------------------------------
// 5. Escalation -> manager, direct, never the group
// -----------------------------------------------------------------------
export function buildEscalation(req: {
  id: string
  body: string
  holderName: string
  daysInState: number
}): NotificationCopy {
  const message = [
    `🔺 <b>ESCALATION</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<b>${esc(req.body)}</b>`,
    `👤 ${esc(req.holderName)} · ${req.daysInState}d`,
    ``,
    `Sent to you only — the team group is never told someone is late.`,
  ].join('\n')

  return {
    message,
    buttons: [[{ text: '🔗 Open in tracker', url: `${APP}/requests/${req.id}/status` }]],
  }
}

// -----------------------------------------------------------------------
// 6. Approval needed -> the approver, direct
//
// AUDIENCE ALSO UNRESOLVED, same shape of gap as message 2: nothing in
// workflow.variations (or anywhere else) names who is authorised to
// approve one. approved_by only ever records who DID approve it, after
// the fact.
// -----------------------------------------------------------------------
export function buildApprovalNeeded(variation: {
  id: string
  projectId: string
  label: string
  raisedByName: string
  committedAmount: number | null
  waitingDays: number
}): NotificationCopy {
  const amount = variation.committedAmount != null ? formatUsd0(variation.committedAmount) : '—'
  const message = [
    `✅ <b>APPROVAL NEEDED</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<b>${esc(variation.label)}</b>`,
    `👤 ${esc(variation.raisedByName)} · ${amount} · waiting ${variation.waitingDays}d`,
  ].join('\n')

  return {
    message,
    buttons: [
      [
        { text: '✅ Approve', url: `${APP}/variations/${variation.id}/approve` },
        { text: '🔗 Open in tracker', url: `${APP}/projects/${variation.projectId}` },
      ],
    ],
  }
}
