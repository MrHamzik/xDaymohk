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
  title: 'Сира Пророка ﷺ',
  description: 'Жизнеописание Пророка Мухаммада ﷺ по главам на русском и чеченском языках.',
  keywords: ['Сира', 'Пророк Мухаммад', 'ислам', 'жизнеописание'],
  alternates: { canonical: '/sira' },
  openGraph: {
    title: 'Сира Пророка ﷺ | Даймохк',
    description: 'Жизнеописание Пророка Мухаммада ﷺ по главам на русском и чеченском языках.',
    url: '/sira',
    type: 'website',
  },
};

export default function SiraLayout({ children }: { children: React.ReactNode }) {
  return children;
}
