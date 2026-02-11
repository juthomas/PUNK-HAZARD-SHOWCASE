import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildAlternates, baseUrl } from '@/lib/seo';
import HomeClient from './HomeClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  const alternates = buildAlternates(locale, '');
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: { canonical: alternates.canonical, languages: alternates.languages },
    openGraph: { title: t('title'), description: t('subtitle') },
  };
}

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'PUNK HAZARD',
  url: baseUrl,
  description: 'Ingénierie électronique, PCB, embarqué & robots. Conception de PCB, programmation embarquée, électronique et robots. Du prototype à l\'industrialisation.',
  email: 'contact@punkhazard.org',
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'FR',
  },
};

export default async function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <HomeClient />
    </>
  );
}
