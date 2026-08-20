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
  title: 'Каталог жителей и специалистов',
  description: 'Каталог жителей и специалистов Чеченской Республики: мастера, услуги и соседи рядом с домом. Поиск по сферам и рейтингу.',
  keywords: ['каталог специалистов', 'мастера Чечни', 'услуги Чечня', 'найти специалиста'],
  alternates: { canonical: '/catalog' },
  openGraph: {
    title: 'Каталог жителей и специалистов | Даймохк',
    description: 'Каталог жителей и специалистов Чеченской Республики: мастера, услуги и соседи рядом с домом. Поиск по сферам и рейтингу.',
    url: '/catalog',
    type: 'website',
  },
};

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
