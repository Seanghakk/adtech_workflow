/**
 * Brief 090 fix 3 — the "linked member, insufficient role" case, told
 * apart from "no member row at all" (NoAccessScreen, unchanged). v7.1
 * §14.1/§14.4: a person without rights is told plainly and accurately why,
 * not given a false reason, and the rail stays available (this renders
 * inside the normal (app) shell, same as the screen it stands in for —
 * unlike NoAccessScreen, which layout.tsx renders before the shell even
 * mounts). Blue-tint per v7.1 — nothing here is wrong or late, someone
 * just needs a different role.
 */
export function RestrictedRoleNotice({
  kicker,
  title,
  body,
}: {
  kicker: string
  title: string
  body: string
}) {
  return (
    <div className="wf-admin">
      <div className="wf-admin__header">
        <div className="wf-admin__kicker">{kicker}</div>
        <h1 className="wf-admin__title">{title}</h1>
      </div>
      <div className="wf-restricted-notice">{body}</div>
    </div>
  )
}
