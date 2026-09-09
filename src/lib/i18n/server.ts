import { cookies } from 'next/headers'
import { dictionaries, type DictionaryKey, type Lang } from './dictionary'
import { LANG_COOKIE } from './LanguageProvider'

/** Server Component equivalent of useLanguage()'s `t` — React context
 *  cannot be read in a Server Component, so pages that render translated
 *  text server-side (no client interactivity needed for the text itself)
 *  read the same cookie LanguageProvider writes, directly. */
export async function getServerTranslator(): Promise<(key: DictionaryKey) => string> {
  const cookieStore = await cookies()
  const lang: Lang = cookieStore.get(LANG_COOKIE)?.value === 'km' ? 'km' : 'en'
  return (key: DictionaryKey) => dictionaries[lang][key]
}
