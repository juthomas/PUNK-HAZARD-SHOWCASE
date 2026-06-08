import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import { buildPageMetadata } from '@/lib/seo';
import MonitorClient from './MonitorClient';
import styles from './page.module.css';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'softwaresMonitor' });
  return buildPageMetadata({
    locale,
    pathSegment: 'softwares/monitor',
    title: t('title'),
    description: t('subtitle'),
  });
}

export default function SoftwareMonitorPage() {
  const t = useTranslations('softwaresMonitor');

  return (
    <div className={`page ${styles.page}`}>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>{t('title')}</h1>
            <p className={styles.subtitle}>{t('subtitle')}</p>
          </div>
          <MonitorClient />
        </div>
      </main>
      <Footer />
    </div>
  );
}

