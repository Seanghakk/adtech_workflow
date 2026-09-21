import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { isManagerOrAdmin } from '@/lib/auth/roles'
import { formatMemberName, getUserProfilesByIds, type MemberProfile } from '@/lib/auth/user-profiles'
import { getServerTranslator } from '@/lib/i18n/server'
import { formatDateICT } from '@/lib/format/datetime'
import { NoAccessScreen } from '@/components/NoAccessScreen'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_ADMIN } from '@/lib/breadcrumbs'
import { UnlinkedAccountRow } from './UnlinkedAccountRow'
import { DeactivateMemberControl } from './DeactivateMemberControl'
import { ReactivateMemberControl } from './ReactivateMemberControl'
import { UnlinkMemberControl } from './UnlinkMemberControl'

export const metadata: Metadata = {
  title: 'Users — ADTECH Workflow Tracker',
}

/** Return shape of workflow.list_unlinked_accounts() (migration 009) — no
 *  generated Supabase types exist in this repo (every .from() call here
 *  is untyped for the same reason), so this .rpc() result is annotated
 *  by hand to match the SQL function's own `returns table (...)`. */
interface UnlinkedAccount {
  user_id: string
  email: string | null
  created_at: string
}

/**
 * Screen: User Management (Brief 012 §2 / Design Note Rev 3 §6). Table
 * archetype, no age ladder, no card weight (§2.1/4.8 — "a person is not
 * late; a person is just a person").
 *
 * §2.7 — restricted, not empty: a member without rights is told plainly,
 * never shown a blank table. Same NoAccessScreen every other restricted
 * route in this app already uses (see sales/assign/page.tsx).
 */
export default async function UsersPage() {
  const { member } = await getCurrentMember()

  if (!member || !isManagerOrAdmin(member)) {
    return <NoAccessScreen />
  }

  const supabase = await createClient()
  const t = await getServerTranslator()

  const [{ data: unlinked }, { data: memberRows }, { data: teams }, { data: picProjects }] =
    await Promise.all([
      supabase.rpc('list_unlinked_accounts'),
      supabase
        .from('members')
        .select('id, user_id, role, is_active, teams(id, label_en)')
        .order('created_at', { ascending: true }),
      supabase.from('teams').select('id, label_en').order('sort_order'),
      // §2.6 — "if the member currently holds projects as PIC, say how
      // many." All projects, not only open ones — the consequence (an
      // un-updatable project) is real regardless of status.
      supabase.from('projects').select('pic_id').not('pic_id', 'is', null),
    ])

  const picCountByUserId = new Map<string, number>()
  for (const row of picProjects ?? []) {
    if (!row.pic_id) continue
    picCountByUserId.set(row.pic_id, (picCountByUserId.get(row.pic_id) ?? 0) + 1)
  }

  const profiles = await getUserProfilesByIds(supabase, (memberRows ?? []).map((m) => m.user_id))

  const roleLabel: Record<string, string> = {
    member: t('usersRoleMember'),
    manager: t('usersRoleManager'),
    admin: t('usersRoleAdmin'),
  }

  const teamOptions = (teams ?? []).map((team) => ({ id: team.id, labelEn: team.label_en }))

  // Brief 014 §4.3 — reads the CMMS's existing Telegram link only, never
  // writes it. A real Telegram account can be linked (telegram_chat_id
  // set) without a public @handle, so that state is told apart from
  // "not linked" rather than collapsed into it.
  const telegramLabel = (profile: MemberProfile | undefined): string => {
    if (!profile?.telegramChatId) return t('usersTelegramNotLinked')
    return profile.telegramUsername ? `@${profile.telegramUsername}` : t('usersTelegramLinkedNoHandle')
  }

  return (
    <>
      <Breadcrumbs ancestors={[{ label: t(CRUMB_ADMIN.label), href: CRUMB_ADMIN.href }]} current={t('navUsers')} />
      <div className="wf-admin">
      <div className="wf-admin__header">
        <div className="wf-admin__kicker">{t('usersKicker')}</div>
        <h1 className="wf-admin__title">{t('usersTitle')}</h1>
      </div>

      {/* §2.4 — the unlinked-account queue. Always rendered, whether zero
          or many: an empty queue is genuinely good news, not a section
          that disappears (Token Spec v3 §2 — "a blue field with a
          count"). */}
      <section className="wf-queue">
        <div className="wf-queue__head">
          <span className="wf-queue__count">{unlinked?.length ?? 0}</span>
          <span className="wf-queue__label">{t('usersQueueLabel')}</span>
        </div>
        {!unlinked || unlinked.length === 0 ? (
          <p className="wf-queue__empty">{t('usersQueueEmptyFact')}</p>
        ) : (
          <div className="wf-queue__list">
            {(unlinked as UnlinkedAccount[]).map((account) => (
              <UnlinkedAccountRow
                key={account.user_id}
                userId={account.user_id}
                email={account.email}
                noEmailText={t('usersQueueNoEmail')}
                sinceLabel={`${t('usersQueueEmail')} ${formatDateICT(account.created_at)}`}
                teams={teamOptions}
              />
            ))}
          </div>
        )}
      </section>

      <table className="wf-admin-table">
        <thead>
          <tr>
            <th>{t('usersColName')}</th>
            <th>{t('usersColAccount')}</th>
            <th>{t('usersColTeam')}</th>
            <th>{t('usersColRole')}</th>
            <th>{t('usersColStatus')}</th>
            <th>{t('usersColTelegram')}</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {(memberRows ?? []).map((m) => {
            const profile = profiles.get(m.user_id)
            // §2.8 — names are proper nouns, rendered as entered, never
            // translated or transliterated. Brief 013 §3 — a raw id is
            // never the fallback; an existing member with no profile row
            // says so in words.
            const name = formatMemberName(profile, t('membersNoProfile'))
            const team = Array.isArray(m.teams) ? m.teams[0] : m.teams
            const picProjectCount = picCountByUserId.get(m.user_id) ?? 0
            return (
              <tr key={m.id} className={m.is_active ? undefined : 'wf-admin-row--inactive'}>
                <td>{name}</td>
                <td>{profile?.username ?? '—'}</td>
                <td>{team?.label_en ?? '—'}</td>
                <td>{roleLabel[m.role] ?? m.role}</td>
                <td>{m.is_active ? t('usersStatusActive') : t('usersStatusInactive')}</td>
                <td>
                  {telegramLabel(profile)}
                  {!profile?.telegramChatId && (
                    <span className="wf-admin-table__hint">{t('usersTelegramLinkHint')}</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {m.is_active ? (
                      <DeactivateMemberControl memberId={m.id} picProjectCount={picProjectCount} />
                    ) : (
                      <ReactivateMemberControl memberId={m.id} />
                    )}
                    <UnlinkMemberControl memberId={m.id} picProjectCount={picProjectCount} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}
