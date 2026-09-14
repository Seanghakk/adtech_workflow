import type { Metadata } from 'next'
import { Poppins, Almarai, Noto_Sans_Khmer } from 'next/font/google'
import { cookies } from 'next/headers'
import { LanguageProvider, LANG_COOKIE } from '@/lib/i18n/LanguageProvider'
import type { Lang } from '@/lib/i18n/dictionary'
import './globals.css'

// Fable Brief 003 §3.2 — the CMMS's own type stack: Poppins for body copy,
// Almarai for headings. Archivo is retired along with the rest of the Rev 2
// visual language (§1); Noto Sans Khmer stays untouched (§3.2, "KM MODE IS
// BEING KEPT" — Poppins has no Khmer glyphs).
const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

const almarai = Almarai({
  variable: '--font-almarai',
  subsets: ['latin'],
  weight: ['700', '800'],
})

const notoSansKhmer = Noto_Sans_Khmer({
  variable: '--font-noto-khmer',
  subsets: ['khmer'],
  weight: ['400', '600'],
})

export const metadata: Metadata = {
  title: 'ADTECH Workflow Tracker',
  description: "Who's holding this, and how long has it been sitting.",
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const cookieStore = await cookies()
  const initialLang = (cookieStore.get(LANG_COOKIE)?.value as Lang) === 'km' ? 'km' : 'en'

  return (
    <html
      lang={initialLang}
      className={`${poppins.variable} ${almarai.variable} ${notoSansKhmer.variable}`}
    >
      <body>
        <LanguageProvider initialLang={initialLang}>{children}</LanguageProvider>
      </body>
    </html>
  )
}
