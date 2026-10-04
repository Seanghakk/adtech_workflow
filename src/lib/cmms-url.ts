/**
 * ADTECH_WF_Brief_107 — where the CMMS lives, for the pages that send a
 * person there to set up two-step, use a recovery code or change a
 * temporary password. Set NEXT_PUBLIC_CMMS_URL in Vercel (no hardcoded
 * domain); unset means the pages say "open the CMMS" without a link.
 */
export function cmmsUrl(path: string): string | null {
  const base = (process.env.NEXT_PUBLIC_CMMS_URL ?? '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//.test(base)) return null
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
