/**
 * Single shared date/time formatting module for this app.
 *
 * ICT (Asia/Phnom_Penh) is the house timezone — Brief 001 §2. The CMMS was
 * repeatedly bitten by UTC-vs-ICT bugs in server-rendered dates because
 * formatting calls scattered ad hoc timezone handling across the codebase.
 * Every server-side date format in this app MUST go through this module —
 * do not call `toLocaleString` / `Intl.DateTimeFormat` directly elsewhere.
 */

export const ICT_TIME_ZONE = 'Asia/Phnom_Penh'

type FormatInput = Date | string | number

function toDate(value: FormatInput): Date {
  return value instanceof Date ? value : new Date(value)
}

/** e.g. "8 Sep 2026" */
export function formatDateICT(value: FormatInput): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ICT_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(toDate(value))
}

/** e.g. "8 Sep 2026, 14:32" */
export function formatDateTimeICT(value: FormatInput): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ICT_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(toDate(value))
}

/** e.g. "14:32" */
export function formatTimeICT(value: FormatInput): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ICT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(toDate(value))
}

/**
 * Whole ICT calendar days between a timestamp and now — for age/stall
 * displays (e.g. Brief 001 §4.6's stall-duration figures). Diffs ICT
 * calendar dates rather than raw 24h buckets, so "yesterday evening ICT"
 * reads as 1 day, not 0, regardless of what UTC offset produced it.
 */
export function daysSinceICT(value: FormatInput, now: FormatInput = new Date()): number {
  const startOfDayICT = (d: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ICT_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d)
    const y = Number(parts.find((p) => p.type === 'year')!.value)
    const m = Number(parts.find((p) => p.type === 'month')!.value)
    const day = Number(parts.find((p) => p.type === 'day')!.value)
    return Date.UTC(y, m - 1, day)
  }

  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((startOfDayICT(toDate(now)) - startOfDayICT(toDate(value))) / msPerDay)
}
