import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildAlternates } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });
  const alternates = buildAlternates(locale, 'contact');
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: { canonical: alternates.canonical, languages: alternates.languages },
    openGraph: { title: t('title'), description: t('subtitle') },
  };
}

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
