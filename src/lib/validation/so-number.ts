/**
 * SO number format validation.
 *
 * Format: ADxxxx-xx{T|S|C|P|D}, where the trailing letter is Trading,
 * Service, CSTC, Project, or Design. VAT SOs carry a "V" before the year
 * (AD0746-V26S); non-VAT omit it (AD0746-26S). VAT and non-VAT are
 * separate registers — the full code string is the unique value, not the
 * sequence number, so a shared sequence number across the two registers is
 * NOT a duplicate (Brief 001 §4.3).
 *
 * This was originally a database CHECK constraint on workflow.projects.
 * By decision, validation lives here instead: a format fix ships as a
 * code change, not a migration, and workflow.projects.so_number is
 * otherwise unconstrained at the database level. Enforce this at every
 * write path that sets so_number — it is no longer enforced for you.
 */

const SO_NUMBER_PATTERN = /^AD[0-9]{4}-V?[0-9]{2}[TSCPD]$/

export function isValidSoNumber(value: string): boolean {
  return SO_NUMBER_PATTERN.test(value)
}

export function assertValidSoNumber(value: string): void {
  if (!isValidSoNumber(value)) {
    throw new Error(
      `Invalid SO number "${value}" — expected ADxxxx-xx{T|S|C|P|D}, ` +
        `e.g. AD0746-26S, or AD0746-V26S for a VAT SO.`,
    )
  }
}
