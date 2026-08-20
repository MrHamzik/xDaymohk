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
  title: 'О проекте',
  description: 'О платформе Даймохк: зачем создан проект, кто за ним стоит и как он помогает жителям Чеченской Республики.',
  keywords: ['о проекте', 'Даймохк', 'платформа Чечни'],
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'О проекте | Даймохк',
    description: 'О платформе Даймохк: зачем создан проект, кто за ним стоит и как он помогает жителям Чеченской Республики.',
    url: '/about',
    type: 'website',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
