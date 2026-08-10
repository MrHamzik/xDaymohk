/** @type {import('next').NextConfig} */
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
];

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
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
};

export default nextConfig;
