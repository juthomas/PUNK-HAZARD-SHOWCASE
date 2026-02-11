import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  return buildPageMetadata({
    locale,
    pathSegment: 'shutdown',
    title: 'Shutdown',
    description:
      locale === 'fr'
        ? 'Page expérimentale non destinée à l’indexation.'
        : 'Experimental page not intended for indexing.',
    noIndex: true,
  });
}

export default function ShutdownLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
