'use client'

/**
 * Single shared language context (Brief 002 §5.2) — every component reads
 * the current language and translates through this, rather than each
 * screen inventing its own switch. Persists via a plain cookie (read
 * server-side on the next request, so SSR renders the right language
 * immediately instead of flashing English first) — not localStorage,
 * since the root layout needs the value before any client JS runs.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { dictionaries, type DictionaryKey, type Lang } from './dictionary'

const LANG_COOKIE = 'wf_lang'

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: DictionaryKey) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({
  initialLang,
  children,
}: {
  initialLang: Lang
  children: React.ReactNode
}) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    if (typeof document !== 'undefined') {
      // 1 year, path-wide — read server-side via cookies() in layout.tsx.
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    }
  }, [])

  const t = useCallback((key: DictionaryKey) => dictionaries[lang][key], [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage() must be used inside <LanguageProvider>')
  return ctx
}

export { LANG_COOKIE }
