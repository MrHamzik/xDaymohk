import './globals.css';
import type { Metadata } from 'next';
import ThemeProvider from '@/components/ThemeProvider';
import AuthProvider from '@/components/AuthProvider';
import ProfilesProvider from '@/components/ProfilesProvider';
import NotificationsProvider from '@/components/NotificationsProvider';
import OnboardingModal from '@/components/OnboardingModal';
import { I18nProvider } from '@/lib/i18n';
import SidebarNav from '@/components/SidebarNav';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://daymohk.vercel.app'),
  title: {
    default: 'Даймохк — платформа Чеченской Республики',
    template: '%s | Даймохк',
  },
  description: 'Даймохк — каталог жителей, специалистов и услуг Чеченской Республики: ВайГIуллакх, ВайГIо, Вайнах. Найдите мастера, соседа, услугу рядом с домом.',
  keywords: [
    'Даймохк',
    'Чеченская Республика',
    'каталог жителей',
    'специалисты Чечни',
    'ВайГIуллакх',
    'ВайГIо',
    'Вайнах',
    'услуги Чечня',
    'родина чеченцев',
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
    title: 'Даймохк — платформа Чеченской Республики',
    description: 'Каталог жителей, специалистов, ВайГIуллакх, ВайГIо, Вайнах. Всё о жизни Даймохка.',
    images: [{ url: '/icon.png', width: 512, height: 512, alt: 'Даймохк' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Даймохк — платформа Чеченской Республики',
    description: 'Даймохк — каталог жителей и специалистов Чеченской Республики: ВайГIуллакх, ВайГIо, Вайнах.',
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
                  <OnboardingModal />
                </ProfilesProvider>
              </NotificationsProvider>
            </AuthProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}