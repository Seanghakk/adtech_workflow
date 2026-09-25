import type { DictionaryKey } from '@/lib/i18n/dictionary'

/**
 * The four drawing_type values migration 018's CHECK allows, and the
 * dictionary key that names each.
 *
 * Deliberately in a PLAIN module rather than beside the row component that
 * first used it: that component is 'use client', and a non-component export
 * read from a client module inside a Server Component comes back as a
 * client reference, not the object — which silently made every drawing in
 * the Brief 100 Part B drawer read "System schematic". One map, importable
 * from both sides.
 */
/** The four types the app knows. Brief 102 needs them as a type, not
 *  just as a lookup, so the scope-to-type split can be checked. */
export type DrawingTypeKey = 'schematic' | 'typical_section' | 'layout' | 'detail_connection'

export const DRAWING_TYPE_KEYS: Record<string, DictionaryKey> = {
  schematic: 'drawingTypeSchematic',
  typical_section: 'drawingTypeTypicalSection',
  layout: 'drawingTypeLayout',
  detail_connection: 'drawingTypeDetailConnection',
}
