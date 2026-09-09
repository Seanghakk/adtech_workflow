/**
 * Fallback for DB-sourced bilingual labels (workflow.reason_codes,
 * workflow.teams, workflow.stages, …), pending a native-speaker Khmer
 * pass (Brief 001 §4.4 / 001C §1).
 *
 * CORRECTION vs. Brief 002 §5.3: the brief describes label_km as "NULL
 * throughout." That's true for workflow.teams (its label_km column is
 * genuinely nullable and omitted from the seed insert), but NOT true for
 * workflow.reason_codes — reading migration 001 directly, its label_km
 * column is `not null`, and every seeded row carries a literal bracketed
 * placeholder string, e.g. "[provisional — km TBD: awaiting_client]", not
 * SQL NULL. Trusting the brief's prose here would have shown that
 * placeholder text to a KM-mode user instead of falling back to English.
 * So this treats both "genuinely NULL" and "a provisional placeholder
 * string" as "not really translated yet" and falls back to label_en
 * either way — see Result 002 for this finding.
 */
export function localizedLabel(labelEn: string, labelKm: string | null, lang: 'en' | 'km'): string {
  const isRealTranslation = labelKm && !labelKm.startsWith('[provisional')
  if (lang === 'km' && isRealTranslation) return labelKm
  return labelEn
}
