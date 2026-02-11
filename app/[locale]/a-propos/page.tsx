import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { useTranslations } from 'next-intl';
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
  const t = await getTranslations({ locale, namespace: 'about' });
  const alternates = buildAlternates(locale, 'a-propos');
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: { canonical: alternates.canonical, languages: alternates.languages },
    openGraph: { title: t('title'), description: t('subtitle') },
  };
}

export default function AboutPage() {
  const t = useTranslations('about');

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>{t('title')}</h1>
            <p className={styles.subtitle}>{t('subtitle')}</p>
          </div>

          <div className={styles.content}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.mission.title')}</h2>
              <p>{t('sections.mission.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.expertise.title')}</h2>
              <p>{t('sections.expertise.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.collaborations.title')}</h2>
              <p>{t('sections.collaborations.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.approach.title')}</h2>
              <p>{t('sections.approach.content')}</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
