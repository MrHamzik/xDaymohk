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
  title: 'Священный Коран — суры и аяты',
  description: 'Священный Коран в Даймохк: суры и аяты с поиском по разделу и сохранением места чтения.',
  keywords: ['Коран', 'суры', 'аяты', 'Къуръан', 'ислам'],
  alternates: { canonical: '/quran' },
  openGraph: {
    title: 'Священный Коран — суры и аяты | Даймохк',
    description: 'Священный Коран: суры и аяты с поиском по разделу и сохранением места чтения.',
    url: '/quran',
    type: 'website',
  },
};

export default function QuranLayout({ children }: { children: React.ReactNode }) {
  return children;
}
