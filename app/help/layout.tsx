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
  title: 'Поддержка',
  description: 'Поддержка Даймохк: частые вопросы, обращения к администрации и обратная связь.',
  keywords: ['поддержка', 'помощь', 'вопросы', 'обратная связь'],
  alternates: { canonical: '/help' },
  openGraph: {
    title: 'Поддержка | Даймохк',
    description: 'Поддержка Даймохк: частые вопросы, обращения к администрации и обратная связь.',
    url: '/help',
    type: 'website',
  },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
