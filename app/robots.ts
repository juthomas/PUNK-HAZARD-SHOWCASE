import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://punkhazard.org';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/', // Routes API (contact, auth, etc.)
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
