import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Manrope } from 'next/font/google'
import { AuthProvider } from '@/components/auth-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/toaster'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

// Títulos da identidade Check (Manrope ExtraBold); o corpo segue em Inter.
const manrope = Manrope({
  weight: ['600', '700', '800'],
  subsets: ['latin'],
  variable: '--font-manrope',
})

export const metadata: Metadata = {
  // Base para resolver URLs absolutas de Open Graph/Twitter (thumbnails do
  // preview no WhatsApp/Facebook). Configure NEXT_PUBLIC_SITE_URL em produção.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Check',
  description:
    'Suba reels, posts e campanhas, envie um link e receba aprovação, comentários e notas do cliente direto do navegador.',
  applicationName: 'Check',
  appleWebApp: {
    capable: true,
    title: 'Check',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    // Declaração explícita: alguns navegadores não inferem `app/icon.png`
    // quando a página também usa manifest/apple-touch-icon e mostram o globo
    // genérico na aba. O PNG traz a marca Check com boa leitura em 16–32 px.
    icon: [{ url: '/icon.png', type: 'image/png', sizes: '180x180' }],
    apple: '/logo-check.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ebece7' },
    { media: '(prefers-color-scheme: dark)', color: '#17201a' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-background font-sans antialiased" suppressHydrationWarning>
        <div className="relative z-[1]">
          <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </div>
        <Toaster />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
