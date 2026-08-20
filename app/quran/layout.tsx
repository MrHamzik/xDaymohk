import type { Metadata } from 'next';

/**
 * Метаданные раздела. Вынесены в layout, потому что сама страница —
 * клиентский компонент ('use client'), а он экспортировать metadata
 * не может.
 *
 * Заголовок пишется без « | Даймохк»: суффикс добавит шаблон
 * title.template из app/layout.tsx.
 */
export const metadata: Metadata = {
  title: 'Священный Коран — справочник сур',
  description: 'Справочник сур Священного Корана с названиями на арабском, чеченском и русском языках.',
  keywords: ['Коран', 'суры', 'Къуръан', 'ислам'],
  alternates: { canonical: '/quran' },
  openGraph: {
    title: 'Священный Коран — справочник сур | Даймохк',
    description: 'Справочник сур Священного Корана с названиями на арабском, чеченском и русском языках.',
    url: '/quran',
    type: 'website',
  },
};

export default function QuranLayout({ children }: { children: React.ReactNode }) {
  return children;
}
