import type { Metadata } from 'next';

/**
 * Реквизиты из QR живут в hash и на сервер не попадают.
 * Страницу не индексируем: в коде может быть номер карты.
 */
export const metadata: Metadata = {
  title: 'Реквизиты для перевода',
  robots: { index: false, follow: false },
};

export default function PayoutQrLayout({ children }: { children: React.ReactNode }) {
  return children;
}
