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
  title: 'Темщик — задания за вознаграждение',
  description: 'Задания за вознаграждение в Чеченской Республике: срочные поручения, покупки, работа по дому и подработка рядом с домом.',
  keywords: ['Темщик', 'задания Чечня', 'подработка Чечня', 'поручения', 'работа рядом'],
  alternates: { canonical: '/temshik' },
  openGraph: {
    title: 'Темщик — задания за вознаграждение | Даймохк',
    description: 'Задания за вознаграждение в Чеченской Республике: срочные поручения, покупки, работа по дому и подработка рядом с домом.',
    url: '/temshik',
    type: 'website',
  },
};

export default function TemshikLayout({ children }: { children: React.ReactNode }) {
  return children;
}
