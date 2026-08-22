/** @type {import('next').NextConfig} */
import { withSentryConfig } from '@sentry/nextjs';

const ALLOWED_IMAGE_HOSTNAMES = [
  'images.unsplash.com',
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  'server.arcgisonline.com',
  'a.basemaps.cartocdn.com',
  'b.basemaps.cartocdn.com',
  'c.basemaps.cartocdn.com',
  'd.basemaps.cartocdn.com',
  // Google user avatar CDN (returned by Supabase Auth for Google OAuth).
  // Multiple subdomains are used in rotation; allow them all.
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
];

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

/**
 * Content-Security-Policy.
 *
 * Собирается из реальных внешних источников проекта: тайлы карт
 * (OSM / ArcGIS / Carto), аватары Google и Unsplash, Supabase (включая
 * websocket для realtime), курс валют и встроенные ролики YouTube.
 *
 * Пока политика идёт в режиме Report-Only (см. ниже): она НЕ блокирует
 * загрузки, только пишет нарушения в консоль браузера. Это намеренно —
 * включать сразу боевой заголовок на живом сайте нельзя, сначала надо
 * убедиться, что ничего не отвалилось. Как перевести в боевой режим,
 * описано в README.
 *
 * 'unsafe-inline' и 'unsafe-eval' в script-src — требование дев-режима
 * Next (HMR). В проде остаётся только 'unsafe-inline': его убирают
 * переходом на nonce, это отдельная задача.
 */
const SUPABASE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const isDev = process.env.NODE_ENV !== 'production';

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  // fonts.googleapis.com — таблица стилей шрифтов, fonts.gstatic.com —
  // сами файлы шрифтов: подключаются через @import в globals.css.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  [
    'img-src',
    "'self'",
    'data:',
    'blob:',
    'https://*.tile.openstreetmap.org',
    'https://server.arcgisonline.com',
    'https://*.basemaps.cartocdn.com',
    'https://images.unsplash.com',
    'https://lh3.googleusercontent.com',
    'https://lh4.googleusercontent.com',
    'https://lh5.googleusercontent.com',
    'https://lh6.googleusercontent.com',
    SUPABASE_ORIGIN,
  ].filter(Boolean).join(' '),
  "font-src 'self' data: https://fonts.gstatic.com",
  [
    'connect-src',
    "'self'",
    SUPABASE_ORIGIN,
    SUPABASE_ORIGIN.replace(/^https:/, 'wss:'),
    'https://open.er-api.com',
    'https://nominatim.openstreetmap.org https://router.project-osrm.org',
  ].filter(Boolean).join(' '),
  "frame-src 'self' https://www.youtube-nocookie.com",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  // upgrade-insecure-requests здесь НЕТ намеренно (п.13). В политике
  // Content-Security-Policy-Report-Only эта директива по спецификации
  // игнорируется — «наблюдать» за автоподъёмом до HTTPS нечего, его
  // либо делают, либо нет. Браузер честно писал об этом в консоль
  // предупреждением. Директиву выносим в отдельный БОЕВОЙ заголовок
  // ниже.
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },

  // Report-Only: нарушения видны в консоли, но ничего не блокируется.
  // Боевой режим — переименовать ключ в 'Content-Security-Policy'.
  { key: 'Content-Security-Policy-Report-Only', value: cspDirectives },

  // Единственная боевая директива: поднимать http-подресурсы до https.
  // Она ничего не запрещает — списков источников в этой политике нет,
  // поэтому включать её без «обкатки» в report-only безопасно, а в
  // report-only она попросту не работает.
  //
  // Только в проде: по http://localhost разработка от такого подъёма
  // сломалась бы.
  ...(isDev ? [] : [{ key: 'Content-Security-Policy', value: 'upgrade-insecure-requests' }]),

  // HSTS: браузер запоминает, что на домен ходят только по HTTPS.
  // Заголовок действует лишь на HTTPS-ответах, локальной разработке по
  // http://localhost он не мешает. preload не включаем — попадание в
  // список браузеров необратимо и требует осознанного решения.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      ...ALLOWED_IMAGE_HOSTNAMES.map((hostname) => ({ protocol: 'https', hostname })),
      ...(supabaseHost ? [{ protocol: 'https', hostname: supabaseHost }] : []),
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },

  /**
   * Старые адреса разделов заданий. Переименованы в /temshik и
   * /goncholla, чтобы URL совпадал с названием в меню.
   *
   * Редирект постоянный (301): адреса уже в индексе поисковиков и в
   * ссылках, которыми люди делились из карточки задания. Без него
   * старые ссылки отдавали бы 404, а вес страниц потерялся бы.
   * Ссылка на задание идёт с ?task=<id> — query-параметры Next
   * переносит на новый адрес сам.
   */
  async redirects() {
    return [
      { source: '/vayghullakh', destination: '/temshik', permanent: true },
      { source: '/vayghullakh/:path*', destination: '/temshik/:path*', permanent: true },
      { source: '/vaygo', destination: '/goncholla', permanent: true },
      { source: '/vaygo/:path*', destination: '/goncholla/:path*', permanent: true },
    ];
  },
};

// Sentry: подключаем обёртку только если задан SENTRY_DSN / DSN в конфиге,
// чтобы локальная разработка и сборка не требовали Sentry-ключей.
const sentryDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
const config = sentryDsn
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      telemetry: false,
    })
  : nextConfig;

export default config;
