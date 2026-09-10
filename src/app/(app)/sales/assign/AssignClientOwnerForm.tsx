'use client'

import { useActionState } from 'react'
import { assignClientOwner, type AssignClientOwnerState } from './actions'

const initialState: AssignClientOwnerState = { error: null }

export function AssignClientOwnerForm({
  clientId,
  clientName,
  currentOwnerLabel,
  salesEngineers,
}: {
  clientId: string
  clientName: string
  currentOwnerLabel: string
  salesEngineers: { userId: string; label: string }[]
}) {
  const [state, formAction, pending] = useActionState(assignClientOwner, initialState)

  return (
    <form action={formAction} className="assign-client-row">
      <input type="hidden" name="clientId" value={clientId} />
      <span className="assign-client-row__name">{clientName}</span>
      <span className="assign-client-row__current">{currentOwnerLabel}</span>
      <select name="salesEngineerId" defaultValue="" required>
        <option value="" disabled>
          Assign to…
        </option>
        {salesEngineers.map((e) => (
          <option key={e.userId} value={e.userId}>
            {e.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </button>
      {state.error && <span className="assign-client-row__error">{state.error}</span>}
    </form>
  )
}
