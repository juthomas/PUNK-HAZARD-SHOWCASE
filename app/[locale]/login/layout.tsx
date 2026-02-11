import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });

  return buildPageMetadata({
    locale,
    pathSegment: 'login',
    title: t('login'),
    description:
      locale === 'fr'
        ? 'Page de connexion au compte PUNK HAZARD.'
        : 'Login page for your PUNK HAZARD account.',
    noIndex: true,
  });
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
