import type { MetadataRoute } from 'next';

/**
 * Карта сайта для поисковиков.
 *
 * Перечислены только публичные статические разделы. Личный кабинет,
 * настройки и админка сюда не входят: они требуют входа и в индексе
 * им делать нечего (их же закрывает robots.ts).
 *
 * Анкеты и задания не перечисляем: страниц с собственным адресом у них
 * нет, карточки открываются модальным окном поверх ленты.
 */

/** Разделы и их приоритет: главная и каталог важнее справочных страниц. */
const ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' },
  { path: '/catalog', priority: 0.9, changeFrequency: 'daily' },
  { path: '/map', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/temshik', priority: 0.8, changeFrequency: 'hourly' },
  { path: '/goncholla', priority: 0.8, changeFrequency: 'hourly' },
  { path: '/vaynakh', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/sira', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/quran', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/guide', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/help', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/pro', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/legal', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://daymohk.xyz').replace(/\/$/, '');
  const lastModified = new Date();

  return ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
