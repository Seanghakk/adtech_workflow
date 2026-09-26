/**
 * Brief 100 Part E — §12.7's one conditional line on the Saved block.
 *
 * §12.7: on a recorded QC FAIL the Saved block adds "[Name] has been told
 * on Telegram" — the member who set that sub-stage to done — or, where
 * nobody is recorded as having set it done, "No one to notify — this was
 * marked done before tracking."
 *
 * THE PROBLEM, AND WHY THIS FILE EXISTS RATHER THAN A STRING IN THE JSX:
 * Telegram is INERT in this app. `sendTelegramMessageToChat` is written
 * and correct, but TELEGRAM_BOT_TOKEN is configured nowhere and no domain
 * event is wired to it — Brief 029's own header says so, and says that
 * choosing where the triggers fire from is an architecture decision to be
 * flagged rather than guessed at. Nothing has changed that.
 *
 * So "has been told on Telegram" cannot be printed on the strength of
 * §12.7 alone: it would be the screen claiming something that did not
 * happen, which is the exact failure §12.7 spends its last paragraph
 * forbidding ("a status that looks saved and is not is worse than no app
 * at all"). The line is therefore earned, not assumed — `told` is
 * reachable only from a send that actually returned true.
 */

export type NotifyOutcome =
  /** Nobody is recorded as having set it done — §12.7's own sentence. */
  | { kind: 'nobody' }
  /** A send was attempted and Telegram accepted it. */
  | { kind: 'told'; name: string }
  /**
   * Someone is recorded, but notifications are not wired in this app, so
   * no message was sent. Renders no Telegram claim at all. Flagged in the
   * Result doc; it is the state every QC fail lands in today.
   */
  | { kind: 'not_wired'; name: string }

export interface NotifyInput {
  /** Brief 106b — progress_cells.updated_by, resolved to a name, null if
   *  unset. §12.7's notice goes to whoever set THAT SYSTEM'S cell done:
   *  after D096 two crews can have marked the same floor's same sub-stage
   *  done for different systems, and telling the wrong one their work
   *  failed is worse than telling nobody. The cell id already carries the
   *  system, so the caller resolves the right person by construction. */
  markedDoneByName: string | null
  /** Whether a Telegram send was attempted AND returned true. */
  telegramDelivered: boolean
}

/**
 * Only ever called for a recorded FAIL — a pass notifies nobody.
 */
export function deriveNotifyOutcome(input: NotifyInput): NotifyOutcome {
  if (!input.markedDoneByName) return { kind: 'nobody' }
  if (input.telegramDelivered) return { kind: 'told', name: input.markedDoneByName }
  return { kind: 'not_wired', name: input.markedDoneByName }
}
