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
  title: 'Pro-подписка',
  description: 'Pro-подписка Даймохк: расширенные возможности для специалистов и жителей.',
  keywords: ['Pro', 'подписка', 'премиум'],
  alternates: { canonical: '/pro' },
  openGraph: {
    title: 'Pro-подписка | Даймохк',
    description: 'Pro-подписка Даймохк: расширенные возможности для специалистов и жителей.',
    url: '/pro',
    type: 'website',
  },
};

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return children;
}
