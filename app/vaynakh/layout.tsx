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
  title: 'Нохчалла — язык, обычаи и история',
  description: 'Нохчалла: чеченский язык, обычаи, адаты и история народа — по главам.',
  keywords: ['Нохчалла', 'чеченские обычаи', 'адаты', 'история Чечни'],
  alternates: { canonical: '/vaynakh' },
  openGraph: {
    title: 'Нохчалла — язык, обычаи и история | Даймохк',
    description: 'Нохчалла: чеченский язык, обычаи, адаты и история народа — по главам.',
    url: '/vaynakh',
    type: 'website',
  },
};

export default function VaynakhLayout({ children }: { children: React.ReactNode }) {
  return children;
}
