import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { PostRequestForm } from './PostRequestForm'

export const metadata: Metadata = {
  title: 'Post a request — ADTECH Workflow Tracker',
}

/**
 * Screen 1a — build to what workflow.requests and workflow.request_handoffs
 * actually hold (Brief 015 §1), not a redrawn Rev 2 mock. Any active
 * member reaches this screen — the (app) layout's own access gate already
 * requires an ACTIVE workflow.members row for every route here, so no
 * further restriction is applied on this page (Brief §4).
 *
 * Server Component: fetches the three lookup tables the form's optional
 * fields read from, then hands everything to the client form for the
 * interactive parts (the destination picker, the disabled-Post gating).
 * Brief §3.2 — nothing here falls back to a default if a lookup table is
 * empty; the client form renders that plainly instead.
 */
export default async function PostRequestPage() {
  const supabase = await createClient()
  const t = await getServerTranslator()

  const [{ data: teams }, { data: clients }, { data: sites }, { data: projects }] = await Promise.all([
    supabase
      .from('teams')
      .select('id, code, label_en, label_km')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('sites').select('id, name, client_id').order('name'),
    supabase
      .from('projects')
      .select('id, name, so_number')
      .eq('status', 'open')
      .order('name'),
  ])

  return (
    <div className="update-screen">
      <PostRequestForm
        teams={(teams ?? []).map((team) => ({
          id: team.id,
          labelEn: team.label_en,
          labelKm: team.label_km,
        }))}
        clients={(clients ?? []).map((c) => ({ id: c.id, name: c.name }))}
        sites={(sites ?? []).map((s) => ({ id: s.id, name: s.name, clientId: s.client_id }))}
        projects={(projects ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          soNumber: p.so_number,
        }))}
        strings={{
          kicker: t('requestKicker'),
          title: t('requestTitle'),
          bodyLabel: t('requestBodyLabel'),
          required: t('requestRequired'),
          optional: t('requestOptional'),
          destinationLabel: t('requestDestinationLabel'),
          destinationUnsure: t('requestDestinationUnsure'),
          destinationEmpty: t('requestDestinationEmpty'),
          detailToggle: t('requestDetailToggle'),
          clientLabel: t('requestClientLabel'),
          clientChoose: t('requestClientChoose'),
          clientEmpty: t('requestClientEmpty'),
          siteLabel: t('requestSiteLabel'),
          siteChoose: t('requestSiteChoose'),
          siteChooseClientFirst: t('requestSiteChooseClientFirst'),
          siteEmpty: t('requestSiteEmpty'),
          projectLabel: t('requestProjectLabel'),
          projectChoose: t('requestProjectChoose'),
          projectEmpty: t('requestProjectEmpty'),
          post: t('requestPost'),
          posting: t('requestPosting'),
          cancel: t('requestCancel'),
          blockedTitle: t('requestBlockedTitle'),
          blockedBody: t('requestBlockedBody'),
          hint: t('requestHint'),
          confirmation: t('requestConfirmation'),
          confirmationDismiss: t('requestConfirmationDismiss'),
        }}
      />
    </div>
  )
}
