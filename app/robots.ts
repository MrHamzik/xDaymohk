import type { MetadataRoute } from 'next';

/**
 * Правила обхода для поисковых роботов.
 *
 * Закрываем всё, что за входом или содержит чужие персональные данные:
 * личный кабинет, настройки, выплаты, админку и API. Остальное открыто —
 * каталог жителей и разделы заданий для того и сделаны, чтобы их
 * находили.
 *
 * Disallow не защищает данные (робот может его проигнорировать) —
 * доступ закрывают RLS и проверки на сервере. Это только про индексацию.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://daymohk.xyz').replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/profile', '/settings', '/payouts', '/r'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
