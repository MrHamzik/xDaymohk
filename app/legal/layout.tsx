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
  title: 'Правовая информация',
  description: 'Пользовательское соглашение, оферта и политика конфиденциальности платформы Даймохк.',
  keywords: ['оферта', 'политика конфиденциальности', 'соглашение'],
  alternates: { canonical: '/legal' },
  openGraph: {
    title: 'Правовая информация | Даймохк',
    description: 'Пользовательское соглашение, оферта и политика конфиденциальности платформы Даймохк.',
    url: '/legal',
    type: 'website',
  },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
