import './globals.css';
import type { Metadata } from 'next';
import ThemeProvider from '@/components/ThemeProvider';
import AuthProvider from '@/components/AuthProvider';
import ProfilesProvider from '@/components/ProfilesProvider';
import { BlacklistProvider } from '@/components/BlacklistProvider';
import NotificationsProvider from '@/components/NotificationsProvider';
import SettingsProvider from '@/components/SettingsProvider';
import OnboardingModal from '@/components/OnboardingModal';
import { I18nProvider } from '@/lib/i18n';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://daymohk.vercel.app'),
  title: {
    default: 'Даймохк — платформа Чеченской Республики',
    template: '%s | Даймохк',
  },
  description: 'Даймохк — каталог жителей, специалистов и услуг Чеченской Республики: Темщик, Помощь, Нохчалла. Найдите мастера, соседа, услугу рядом с домом.',
  keywords: [
    'Даймохк',
    'Чеченская Республика',
    'каталог жителей',
    'специалисты Чечни',
    'Темщик',
    'Помощь',
    'Нохчалла',
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
    description: 'Каталог жителей, специалистов, Темщик, Помощь, Нохчалла. Всё о жизни Даймохка.',
    images: [{ url: '/icon.png', width: 512, height: 512, alt: 'Даймохк' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Даймохк — платформа Чеченской Республики',
    description: 'Даймохк — каталог жителей и специалистов Чеченской Республики: Темщик, Помощь, Нохчалла.',
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
      <body suppressHydrationWarning className="antialiased transition-colors duration-200">
        <I18nProvider>
          <ThemeProvider>
            <AuthProvider>
              {/* Настройки идут после AuthProvider: серверная копия
                  читается по account.id. Тема из localStorage
                  применяется раньше, чем придёт ответ сервера. */}
              <SettingsProvider>
                <NotificationsProvider>
                  {/* Чёрный список выше ProfilesProvider: каталог и
                      карта фильтруют выдачу по нему, значит список
                      скрытых должен быть готов раньше анкет. */}
                  <BlacklistProvider>
                    <ProfilesProvider>
                      {children}
                      <ServiceWorkerRegister />
                      <OnboardingModal />
                    </ProfilesProvider>
                  </BlacklistProvider>
                </NotificationsProvider>
              </SettingsProvider>
            </AuthProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}