/**
 * Screen 5a (Brief 029) — the actual send function. Code-complete and
 * correctly written, mirroring the CMMS's own src/lib/telegram.ts
 * (same Bot API shape, same failure-visibility fix that file's own
 * comment documents — a failed send returns false rather than only
 * reaching a console.error nobody would see on Vercel), but genuinely
 * INERT in this app today: process.env.TELEGRAM_BOT_TOKEN is not
 * configured anywhere in adtech-workflow's own deployment (checked
 * directly — grepped every .env* file and this repo's own Vercel
 * project settings are outside this session's reach either way). That
 * is a deployment/secrets decision for Seanghakk, not something this
 * session can set. Every caller of this function today is the preview
 * page only (src/app/(app)/notifications/page.tsx), which never
 * actually calls it — see that page's own comment.
 *
 * NOT WIRED TO ANY REAL DOMAIN EVENT this round. Deciding where each of
 * the six triggers in messages.ts should actually fire from — a
 * Postgres trigger + pg_net/Edge Function, vs. a side effect inside the
 * relevant Next.js server action (handOffRequest, closeRequest, a
 * future triage/bounce/escalation path) — is a real architecture
 * decision this brief's own §1 says to flag rather than guess at, not a
 * detail to settle inside a single function's own implementation.
 */
import type { InlineButton } from './messages'

export async function sendTelegramMessageToChat(
  chatId: string,
  message: string,
  buttons?: InlineButton[][],
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('sendTelegramMessageToChat: TELEGRAM_BOT_TOKEN is not configured — message not sent.')
    return false
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
  }
  if (buttons) {
    body.reply_markup = { inline_keyboard: buttons }
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    console.error(`sendTelegramMessageToChat: Telegram API responded ${res.status}`, await res.text())
  }

  return res.ok
}
