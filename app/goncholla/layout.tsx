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
  title: 'Помощь — безвозмездная взаимопомощь',
  description: 'Безвозмездная помощь соседям: субботники, помощь по дому и благотворительные сборы. Садака за савваб, без оплаты.',
  keywords: ['Помощь', 'взаимопомощь', 'садака', 'волонтёры Чечня', 'ГIончалла'],
  alternates: { canonical: '/goncholla' },
  openGraph: {
    title: 'Помощь — безвозмездная взаимопомощь | Даймохк',
    description: 'Безвозмездная помощь соседям: субботники, помощь по дому и благотворительные сборы. Садака за савваб, без оплаты.',
    url: '/goncholla',
    type: 'website',
  },
};

export default function GonchollaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
