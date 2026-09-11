import { cookies } from 'next/headers'
import { dictionaries, type DictionaryKey, type Lang } from './dictionary'
import { LANG_COOKIE } from './LanguageProvider'

/** The current request's language, read the same way getServerTranslator()
 *  does — for the rarer case a Server Component needs `lang` itself (e.g.
 *  to call localizedLabel() on a DB-sourced bilingual value), not just a
 *  dictionary lookup. */
export async function getServerLang(): Promise<Lang> {
  const cookieStore = await cookies()
  return cookieStore.get(LANG_COOKIE)?.value === 'km' ? 'km' : 'en'
}

/** Server Component equivalent of useLanguage()'s `t` — React context
 *  cannot be read in a Server Component, so pages that render translated
 *  text server-side (no client interactivity needed for the text itself)
 *  read the same cookie LanguageProvider writes, directly. */
export async function getServerTranslator(): Promise<(key: DictionaryKey) => string> {
  const lang = await getServerLang()
  return (key: DictionaryKey) => dictionaries[lang][key]
}
