import type { MetadataRoute } from 'next';
import { locales } from '@/i18n/config';
import { baseUrl, buildAlternates } from '@/lib/seo';

// Pages publiques à inclure (hors login, profil, shutdown)
const publicPaths = [
  '',
  'a-propos',
  'boutique',
  'cgv',
  'contact',
  'mentions-legales',
  'projets',
  'services',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const path of publicPaths) {
      const urlPath = path ? `/${locale}/${path}` : `/${locale}`;
      const alternates = buildAlternates(locale, path);
      entries.push({
        url: `${baseUrl}${urlPath}`,
        lastModified: new Date(),
        changeFrequency: path === '' ? 'weekly' : 'monthly',
        priority: path === '' ? 1 : 0.8,
        alternates: {
          languages: alternates.languages,
        },
      });
    }
  }

  return entries;
}
