const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Shape-check only (no version/variant bit validation) — enough to reject
 * a misread or worn QR label before it ever reaches a database query. A
 * malformed id passed straight to `.eq('id', ...)` on a uuid column throws
 * a raw Postgres "invalid input syntax for type uuid" error instead of the
 * clean not-found state a scanned label deserves.
 *
 * Mirrors the CMMS's own src/lib/uuid.ts (ADTECH_CMMS_Brief_029_
 * QR_Generation) verbatim — brought over for Brief 058's own QR resolve
 * route, which needs the identical guard for the identical reason.
 */
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}
