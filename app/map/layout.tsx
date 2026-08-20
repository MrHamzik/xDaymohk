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
  title: 'Карта села и домов',
  description: 'Интерактивная карта Даймохка: дома, анкеты жителей и объекты села с фильтром по категориям.',
  keywords: ['карта села', 'карта Чечни', 'дома Самашки', 'адреса'],
  alternates: { canonical: '/map' },
  openGraph: {
    title: 'Карта села и домов | Даймохк',
    description: 'Интерактивная карта Даймохка: дома, анкеты жителей и объекты села с фильтром по категориям.',
    url: '/map',
    type: 'website',
  },
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
