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
  title: 'Руководство пользователя',
  description: 'Как пользоваться Даймохком: анкеты, задания, карта и настройки — по шагам.',
  keywords: ['руководство', 'инструкция', 'как пользоваться'],
  alternates: { canonical: '/guide' },
  openGraph: {
    title: 'Руководство пользователя | Даймохк',
    description: 'Как пользоваться Даймохком: анкеты, задания, карта и настройки — по шагам.',
    url: '/guide',
    type: 'website',
  },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
