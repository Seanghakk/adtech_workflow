'use client'

import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { signOut } from '@/app/(app)/actions'

export function SignOutButton() {
  const { t } = useLanguage()
  return (
    <form action={signOut}>
      <button type="submit" className="btn btn--ghost">
        {t('navSignOut')}
      </button>
    </form>
  )
}
