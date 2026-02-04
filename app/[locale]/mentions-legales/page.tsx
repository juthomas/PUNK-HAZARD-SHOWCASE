import { useTranslations } from 'next-intl';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import styles from './page.module.css';

export default function MentionsLegalesPage() {
  const t = useTranslations('legal');

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>{t('title')}</h1>
          </div>

          <div className={styles.content}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.publisher.title')}</h2>
              <p style={{ whiteSpace: 'pre-line' }}>{t('sections.publisher.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.hosting.title')}</h2>
              <p style={{ whiteSpace: 'pre-line' }}>{t('sections.hosting.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.intellectual.title')}</h2>
              <p>{t('sections.intellectual.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.data.title')}</h2>
              <p>{t('sections.data.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.cookies.title')}</h2>
              <p>{t('sections.cookies.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.contact.title')}</h2>
              <p>{t('sections.contact.content')}</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
