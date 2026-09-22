import type { Metadata } from 'next'
import { getCurrentMember } from '@/lib/auth/current-member'
import { isManagerOrAdmin } from '@/lib/auth/roles'
import { getServerTranslator } from '@/lib/i18n/server'
import { NoAccessScreen } from '@/components/NoAccessScreen'
import { RestrictedRoleNotice } from '@/components/RestrictedRoleNotice'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_ADMIN } from '@/lib/breadcrumbs'
import {
  buildApprovalNeeded,
  buildEscalation,
  buildNeededByPassed,
  buildRequestBounced,
  buildRequestPosted,
  buildTriageUnpicked,
  type NotificationCopy,
} from '@/lib/telegram/messages'

export const metadata: Metadata = {
  title: 'Telegram messages — ADTECH Workflow Tracker',
}

/**
 * Screen 5a — Telegram message spec (Brief 029). §3's own instruction:
 * "this is a specification/reference artifact more than a live app
 * screen... if there's a sensible place in-app to preview these
 * templates, build one." This is that place — manager/admin gated, same
 * administration archetype and boundary as /lookups (an internal
 * reference for whoever configures notifications, not a working screen
 * anyone needs day to day).
 *
 * SAMPLE DATA IS HARDCODED HERE, not fetched — these are illustrative
 * examples (matching the mockup's own REQ-0412/REQ-0388/REQ-0392/
 * REQ-0356/V3 sample thread), the same convention the original mockup
 * itself used, not a claim that these specific records exist.
 *
 * Each message's raw text renders in a <pre> block, deliberately not
 * interpreted as HTML — the <b>/<i> tags are Telegram's own parse_mode
 * markup, meant to be read literally here (what will actually be sent),
 * not rendered as page formatting.
 *
 * NO SEND HAPPENS FROM THIS PAGE. Nothing here calls
 * sendTelegramMessageToChat (src/lib/telegram/send.ts) — seeing exactly
 * what a message would say is this page's whole job; actually sending
 * one is out of scope for a reference page and would need a real
 * chat_id and a real trigger, neither of which exist yet (see this
 * page's own §ntoe below and the Result doc).
 *
 * Brief 090 fix 3 — the two restriction cases are told apart, per v7.1
 * §14.1/§14.4 (see users/page.tsx's own comment for the full reasoning).
 */
export default async function NotificationsPage() {
  const { member } = await getCurrentMember()
  const t = await getServerTranslator()

  if (!member) {
    return <NoAccessScreen />
  }
  if (!isManagerOrAdmin(member)) {
    return (
      <RestrictedRoleNotice
        kicker={t('notificationsKicker')}
        title={t('notificationsTitle')}
        body={t('notificationsRestrictedBody')}
      />
    )
  }

  const entries: {
    id: string
    trigger: string
    audience: string
    audienceNote?: string
    copy: NotificationCopy
    blocked?: string
  }[] = [
    {
      id: '1',
      trigger: 'Request posted',
      audience: "Destination team group — no group chat_id exists on workflow.teams yet; see the Result doc.",
      copy: buildRequestPosted({
        id: 'REQ-0412',
        body: 'Fire alarm panel keeps dropping comms at Vattanac Capital — need a site visit this week.',
        requesterName: 'Chhun Vibol',
      }),
    },
    {
      id: '2',
      trigger: 'Untriaged, unpicked for 4 hours',
      audience: 'Triage owner',
      audienceNote:
        'Brief 021 §1.1: triage has no single owner — any active member triages. There is no account or role this message could actually be addressed to yet.',
      copy: buildTriageUnpicked({
        id: 'REQ-0399',
        body: 'Client asking whether the BMS head-end swap covers the annex building too — not sure whose call this is.',
        hoursOpen: 4,
      }),
    },
    {
      id: '3',
      trigger: 'Bounced for clarification',
      audience: 'The requester, direct',
      copy: buildRequestBounced({
        id: 'REQ-0392',
        body: 'Retender the BMS head-end after the client cut scope',
        fromName: 'Chea Sopheak',
        totalAgeDays: 6,
      }),
    },
    {
      id: '4',
      trigger: 'Needed-by passed',
      audience: 'The holder, direct',
      blocked:
        'No needed_by/due-date column exists anywhere on workflow.requests — this trigger can never fire against the real schema as it stands. Same gap Brief 028’s own status frame reports.',
      copy: buildNeededByPassed({
        id: 'REQ-0388',
        body: 'Retender the BMS head-end after the client cut scope',
        holderName: 'Chea Sopheak',
        totalAgeDays: 23,
        daysInState: 2,
      }),
    },
    {
      id: '5',
      trigger: 'Escalation',
      audience: 'Manager, direct — never the team group',
      copy: buildEscalation({
        id: 'REQ-0356',
        body: 'Client threatening to pull the maintenance contract over an unanswered quote',
        holderName: 'Kong Vichea',
        daysInState: 9,
      }),
    },
    {
      id: '6',
      trigger: 'Approval needed',
      audience: 'The approver',
      audienceNote:
        'Nothing in workflow.variations (or anywhere else) names who is authorised to approve one — approved_by only ever records who DID, after the fact.',
      copy: buildApprovalNeeded({
        id: 'v3-sample',
        projectId: 'proj-sample',
        label: 'V3 · Smoke-control interface to the new atrium AHUs',
        raisedByName: 'Chhun Vibol',
        committedAmount: 34900,
        waitingDays: 21,
      }),
    },
  ]

  return (
    <>
      <Breadcrumbs ancestors={[{ label: t(CRUMB_ADMIN.label), href: CRUMB_ADMIN.href }]} current={t('navNotifications')} />
      <div className="wf-admin notifications">
      <div className="wf-admin__header">
        <div className="wf-admin__kicker">{t('notificationsKicker')}</div>
        <h1 className="wf-admin__title">{t('notificationsTitle')}</h1>
      </div>

      <p className="notifications__intro">{t('notificationsIntro')}</p>
      <p className="notifications__gap-note">{t('notificationsSendGapNote')}</p>

      <div className="notifications__list">
        {entries.map((entry) => (
          <div key={entry.id} className="notifications__card">
            <div className="notifications__card-head">
              <span className="notifications__number">{entry.id}</span>
              <div>
                <div className="notifications__meta-row">
                  <span className="notifications__meta-label">{t('notificationsTriggerLabel')}</span>
                  <span>{entry.trigger}</span>
                </div>
                <div className="notifications__meta-row">
                  <span className="notifications__meta-label">{t('notificationsAudienceLabel')}</span>
                  <span>{entry.audience}</span>
                </div>
              </div>
              {entry.blocked && <span className="notifications__blocked-badge">{t('notificationsBlockedBadge')}</span>}
            </div>

            {entry.audienceNote && <p className="notifications__audience-note">{entry.audienceNote}</p>}
            {entry.blocked && <p className="notifications__blocked-note">{entry.blocked}</p>}

            <pre className="notifications__message">{entry.copy.message}</pre>

            {entry.copy.buttons && (
              <div className="notifications__buttons">
                <span className="notifications__meta-label">{t('notificationsButtonsLabel')}</span>
                {entry.copy.buttons.map((row, i) => (
                  <div key={i} className="notifications__button-row">
                    {row.map((btn) => (
                      <span key={btn.text} className="notifications__button">
                        {btn.text}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
    </>
  )
}
