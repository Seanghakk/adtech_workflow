import type { Metadata } from 'next'
import { Archivo, Noto_Sans_Khmer } from 'next/font/google'
import { cookies } from 'next/headers'
import { LanguageProvider, LANG_COOKIE } from '@/lib/i18n/LanguageProvider'
import type { Lang } from '@/lib/i18n/dictionary'
import './globals.css'

const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
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
    <html lang={initialLang} className={`${archivo.variable} ${notoSansKhmer.variable}`}>
      <body>
        <LanguageProvider initialLang={initialLang}>{children}</LanguageProvider>
      </body>
    </html>
  )
}
