import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Даймохк',
    short_name: 'Даймохк',
    description: 'Даймохк — платформа села Самашки: каталог жителей, специалистов, ВайГIуллакх и ВайГIо.',
    start_url: '/',
    display: 'standalone',
    background_color: '#17181b',
    theme_color: '#059669',
    lang: 'ru',
    icons: [
      {
        src: '/icon.png',
        sizes: '128x128',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
