import type { Metadata } from 'next';

export const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://punkhazard.org';
const locales = ['fr', 'en'] as const;
type SiteLocale = (typeof locales)[number];

function normalizeLocale(locale: string): SiteLocale {
  return locales.includes(locale as SiteLocale) ? (locale as SiteLocale) : 'fr';
}

function normalizeSegment(pathSegment: string): string {
  return pathSegment.replace(/^\/+|\/+$/g, '');
}

function toPath(locale: SiteLocale, pathSegment: string): string {
  const segment = normalizeSegment(pathSegment);
  return segment ? `/${locale}/${segment}` : `/${locale}`;
}

function toOgLocale(locale: SiteLocale): string {
  return locale === 'fr' ? 'fr_FR' : 'en_GB';
}

export function buildAlternates(
  locale: string,
  pathSegment: string
): { canonical: string; languages: Record<string, string> } {
  const safeLocale = normalizeLocale(locale);
  const canonicalPath = toPath(safeLocale, pathSegment);
  const frPath = toPath('fr', pathSegment);
  const enPath = toPath('en', pathSegment);

  return {
    canonical: `${baseUrl}${canonicalPath}`,
    languages: {
      fr: `${baseUrl}${frPath}`,
      en: `${baseUrl}${enPath}`,
      'x-default': `${baseUrl}${frPath}`,
    },
  };
}

type PageMetadataOptions = {
  locale: string;
  pathSegment: string;
  title: string;
  description: string;
  noIndex?: boolean;
};

export function buildPageMetadata({
  locale,
  pathSegment,
  title,
  description,
  noIndex = false,
}: PageMetadataOptions): Metadata {
  const safeLocale = normalizeLocale(locale);
  const alternates = buildAlternates(safeLocale, pathSegment);
  const imageUrl = `${baseUrl}${toPath(safeLocale, 'opengraph-image')}`;
  const twitterImageUrl = `${baseUrl}${toPath(safeLocale, 'twitter-image')}`;

  return {
    title,
    description,
    alternates: {
      canonical: alternates.canonical,
      languages: alternates.languages,
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          nocache: true,
          googleBot: {
            index: false,
            follow: false,
            noimageindex: true,
          },
        }
      : undefined,
    openGraph: {
      type: 'website',
      siteName: 'PUNK HAZARD',
      locale: toOgLocale(safeLocale),
      url: alternates.canonical,
      title,
      description,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: 'PUNK HAZARD',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [twitterImageUrl],
    },
  };
}
