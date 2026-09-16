'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { localizedLabel } from '@/lib/i18n/localized-label'
import { postRequest, type PostRequestState } from './actions'

interface Team {
  id: string
  labelEn: string
  labelKm: string | null
}
interface Client {
  id: string
  name: string
}
interface Site {
  id: string
  name: string
  clientId: string
}
interface Project {
  id: string
  name: string
  soNumber: string | null
}

interface PostRequestFormProps {
  teams: Team[]
  clients: Client[]
  sites: Site[]
  projects: Project[]
  strings: {
    kicker: string
    title: string
    bodyLabel: string
    required: string
    optional: string
    destinationLabel: string
    destinationUnsure: string
    destinationEmpty: string
    detailToggle: string
    clientLabel: string
    clientChoose: string
    clientEmpty: string
    siteLabel: string
    siteChoose: string
    siteChooseClientFirst: string
    siteEmpty: string
    projectLabel: string
    projectChoose: string
    projectEmpty: string
    post: string
    posting: string
    cancel: string
    blockedTitle: string
    blockedBody: string
    hint: string
    confirmation: string
    confirmationDismiss: string
  }
}

/** Sentinel for the "I'm not sure" destination option — distinct from any
 *  real team uuid, so a single exclusive-choice string can drive the
 *  reason-grid-style picker (Brief §3.1's destination_unsure button). */
const UNSURE = '__unsure__'

const initialState: PostRequestState = { error: null, posted: null }

export function PostRequestForm({ teams, clients, sites, projects, strings: s }: PostRequestFormProps) {
  const { lang } = useLanguage()
  const [state, formAction, pending] = useActionState(postRequest, initialState)

  const [body, setBody] = useState('')
  const [destination, setDestination] = useState('')
  const [clientId, setClientId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [handledPosted, setHandledPosted] = useState<string | null>(null)

  // Brief §3.5 — "a confirmation on the form itself is acceptable" — no
  // redirect. state.posted is a fresh token on every successful submit
  // (never reused), so comparing it against the last one this render
  // already handled reliably re-fires on a second post even if the first
  // confirmation was never dismissed, and clears the form for the next
  // one. React's own documented pattern for "adjust state when a prop
  // changes" (not a useEffect, which the project's lint config flags for
  // exactly this shape — see react-hooks/set-state-in-effect).
  if (state.posted && state.posted !== handledPosted) {
    setHandledPosted(state.posted)
    setShowConfirmation(true)
    setBody('')
    setDestination('')
    setClientId('')
    setSiteId('')
    setProjectId('')
  }

  const destinationTeamId = destination !== UNSURE ? destination : ''
  const destinationUnsure = destination === UNSURE

  const canPost = body.trim() !== '' && destination !== '' && !pending

  const sitesForClient = useMemo(
    () => sites.filter((site) => site.clientId === clientId),
    [sites, clientId],
  )

  return (
    <div className="update-card request-form">
      {showConfirmation ? (
        <div className="request-form__confirmation">
          <span>{s.confirmation}</span>
          <button
            type="button"
            className="request-form__confirmation-dismiss"
            onClick={() => setShowConfirmation(false)}
          >
            {s.confirmationDismiss}
          </button>
        </div>
      ) : null}

      <form action={formAction}>
        <input type="hidden" name="destinationTeamId" value={destinationTeamId} />
        <input type="hidden" name="destinationUnsure" value={destinationUnsure ? 'true' : 'false'} />
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="siteId" value={siteId} />
        <input type="hidden" name="projectId" value={projectId} />

        <div className="request-form__block">
          <label className="field">
            <span className="field__label">
              {s.bodyLabel} <span className="required-badge">{s.required}</span>
            </span>
            <textarea
              className="field__textarea"
              name="body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
        </div>

        <div className="request-form__block">
          <div className="request-form__block-head">
            <span className="request-form__block-label">{s.destinationLabel}</span>
            <span className="required-badge">{s.required}</span>
          </div>

          {teams.length === 0 ? (
            <p className="request-form__lookup-empty">{s.destinationEmpty}</p>
          ) : null}

          <div className="reason-grid" role="radiogroup" aria-label={s.destinationLabel}>
            {teams.map((team) => {
              const selected = destination === team.id
              return (
                <button
                  key={team.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? 'reason-option reason-option--selected' : 'reason-option'}
                  onClick={() => setDestination(team.id)}
                >
                  <span className="reason-option__box" aria-hidden="true" />
                  <span className="reason-option__label">
                    {localizedLabel(team.labelEn, team.labelKm, lang)}
                  </span>
                </button>
              )
            })}
            <button
              key={UNSURE}
              type="button"
              role="radio"
              aria-checked={destination === UNSURE}
              className={
                destination === UNSURE ? 'reason-option reason-option--selected' : 'reason-option'
              }
              onClick={() => setDestination(UNSURE)}
            >
              <span className="reason-option__box" aria-hidden="true" />
              <span className="reason-option__label">{s.destinationUnsure}</span>
            </button>
          </div>
        </div>

        <details className="request-form__block request-form__block--rule">
          <summary className="request-form__detail-summary">{s.detailToggle}</summary>
          <div className="request-form__detail-fields">
            <label className="field">
              <span className="field__label">
                {s.clientLabel} <span className="field__label-optional">{s.optional}</span>
              </span>
              {clients.length === 0 ? (
                <p className="request-form__lookup-empty">{s.clientEmpty}</p>
              ) : (
                <select
                  className="field__input"
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value)
                    setSiteId('')
                  }}
                >
                  <option value="">{s.clientChoose}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="field">
              <span className="field__label">
                {s.siteLabel} <span className="field__label-optional">{s.optional}</span>
              </span>
              {!clientId ? (
                <p className="request-form__lookup-empty">{s.siteChooseClientFirst}</p>
              ) : sitesForClient.length === 0 ? (
                <p className="request-form__lookup-empty">{s.siteEmpty}</p>
              ) : (
                <select className="field__input" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  <option value="">{s.siteChoose}</option>
                  {sitesForClient.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="field">
              <span className="field__label">
                {s.projectLabel} <span className="field__label-optional">{s.optional}</span>
              </span>
              {projects.length === 0 ? (
                <p className="request-form__lookup-empty">{s.projectEmpty}</p>
              ) : (
                <select
                  className="field__input"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">{s.projectChoose}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.soNumber ? `${p.soNumber} — ${p.name}` : p.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>
        </details>

        <div className="update-card__footer">
          <button
            type="submit"
            className={canPost ? 'btn btn--primary' : 'btn btn--primary btn--disabled'}
            // Same pattern as 6a's Save button (Brief §0's standing trap):
            // `disabled` tracks only `pending`, never the content gates
            // below, so this stays a real clickable element and the guard
            // absorbs the click instead of the browser silently dropping
            // it via a natively disabled button.
            disabled={pending}
            onClick={(e) => {
              if (body.trim() === '') {
                e.preventDefault()
                console.log('[1a post request] Post clicked with no body written — blocked client-side, not submitted')
              } else if (destination === '') {
                e.preventDefault()
                console.log('[1a post request] Post clicked with no destination chosen — blocked client-side, not submitted')
              }
            }}
          >
            {pending ? s.posting : s.post}
          </button>
          <Link href="/" className="btn btn--outline">
            {s.cancel}
          </Link>

          {body.trim() === '' || destination === '' ? (
            <div className="update-card__blocked-note">
              <div className="update-card__blocked-title">{s.blockedTitle}</div>
              <div className="update-card__blocked-body">{s.blockedBody}</div>
            </div>
          ) : (
            <span className="request-form__hint">{s.hint}</span>
          )}
        </div>

        {state.error ? (
          <div className="update-card__error" role="alert">
            {state.error}
          </div>
        ) : null}
      </form>
    </div>
  )
}
