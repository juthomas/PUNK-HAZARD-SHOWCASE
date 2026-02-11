const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://punkhazard.org';
const locales = ['fr', 'en'] as const;

export { baseUrl };

export function buildAlternates(
  locale: string,
  pathSegment: string
): { canonical: string; languages: Record<string, string> } {
  const path = pathSegment ? `/${pathSegment}` : '';
  return {
    canonical: `${baseUrl}/${locale}${path}`,
    languages: {
      fr: `${baseUrl}/fr${path}`,
      en: `${baseUrl}/en${path}`,
    },
  };
}
