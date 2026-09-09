'use client'

import { useLanguage } from '@/lib/i18n/LanguageProvider'

export function LanguageToggle() {
  const { lang, setLang, t } = useLanguage()

  return (
    <div className="lang-toggle" role="group" aria-label={t('langToggleLabel')}>
      <button
        type="button"
        className={lang === 'en' ? 'lang-toggle__opt lang-toggle__opt--active' : 'lang-toggle__opt'}
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={lang === 'km' ? 'lang-toggle__opt lang-toggle__opt--active' : 'lang-toggle__opt'}
        aria-pressed={lang === 'km'}
        onClick={() => setLang('km')}
      >
        KM
      </button>
    </div>
  )
}
