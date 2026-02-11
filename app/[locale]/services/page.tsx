import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import { buildAlternates } from '@/lib/seo';
import styles from './page.module.css';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'services' });
  const alternates = buildAlternates(locale, 'services');
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: { canonical: alternates.canonical, languages: alternates.languages },
    openGraph: { title: t('title'), description: t('subtitle') },
  };
}

export default function ServicesPage() {
  const t = useTranslations('services');
  const tHome = useTranslations('home.sections.services');

  const services = [
    {
      title: tHome('items.pcb.title'),
      description: tHome('items.pcb.description'),
      items: tHome.raw('items.pcb.features'),
    },
    {
      title: tHome('items.electronics.title'),
      description: tHome('items.electronics.description'),
      items: tHome.raw('items.electronics.features'),
    },
    {
      title: tHome('items.integration.title'),
      description: tHome('items.integration.description'),
      items: tHome.raw('items.integration.features'),
    },
    {
      title: tHome('items.go2.title'),
      description: tHome('items.go2.description'),
      items: tHome.raw('items.go2.features'),
    },
  ];

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>{t('title')}</h1>
            <p className={styles.subtitle}>{t('subtitle')}</p>
          </div>

          <div className={styles.grid}>
            {services.map((service, index) => (
              <div key={index} className={styles.card}>
                <h3 className={styles.cardTitle}>{service.title}</h3>
                <p className={styles.cardDescription}>{service.description}</p>
                <ul className={styles.cardList}>
                  {service.items.map((item: string, itemIndex: number) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className={styles.cta}>
            <h2 className={styles.ctaTitle}>{t('cta.title')}</h2>
            <p className={styles.ctaText}>{t('cta.description')}</p>
            <Link href="/contact" className={styles.ctaButton}>
              Contact
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
