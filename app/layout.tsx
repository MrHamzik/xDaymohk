import './globals.css';
import type { Metadata } from 'next';
import ThemeProvider from '@/components/ThemeProvider';
import AuthProvider from '@/components/AuthProvider';
import ProfilesProvider from '@/components/ProfilesProvider';
import NotificationsProvider from '@/components/NotificationsProvider';
import { I18nProvider } from '@/lib/i18n';
import SidebarNav from '@/components/SidebarNav';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://daymohk.vercel.app'),
  title: {
    default: 'Даймохк — платформа села Самашки',
    template: '%s | Даймохк',
  },
  description: 'Даймохк — платформа села Самашки: каталог жителей, специалистов, ВайГIуллакх, ВайГIо, Вайнах. Найдите мастера, соседа, услугу рядом с домом.',
  keywords: [
    'Даймохк',
    'Самашки',
    'Samashki',
    'каталог жителей',
    'специалисты Самашки',
    'ВайГIуллакх',
    'ВайГIо',
    'Вайнах',
    'услуги Чечня',
    'Ачхой-Мартан',
    'самашкинцы',
  ],
  authors: [{ name: 'Даймохк', url: 'https://daymohk.vercel.app' }],
  creator: 'Даймохк',
  publisher: 'Даймохк',
  formatDetection: { telephone: true, email: true, address: true },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/',
    siteName: 'Даймохк',
    title: 'Даймохк — платформа села Самашки',
    description: 'Каталог жителей, специалистов, ВайГIуллакх, ВайГIо, Вайнах. Всё о жизни села Самашки.',
    images: [{ url: '/icon.png', width: 512, height: 512, alt: 'Даймохк' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Даймохк — платформа села Самашки',
    description: 'Даймохк — каталог жителей и специалистов села Самашки: ВайГIуллакх, ВайГIо, Вайнах.',
    images: ['/icon.png'],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  category: 'community',
  icons: { icon: '/icon.png', apple: '/apple-icon.png' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased selection:bg-emerald-500 selection:text-white transition-colors duration-200">
        <I18nProvider>
          <ThemeProvider>
            <AuthProvider>
              <NotificationsProvider>
                <ProfilesProvider>
                  {children}
                </ProfilesProvider>
              </NotificationsProvider>
            </AuthProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}