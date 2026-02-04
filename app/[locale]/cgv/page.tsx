import { useTranslations } from 'next-intl';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import styles from './page.module.css';

export default function CGVPage() {
  const t = useTranslations('cgv');

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>{t('title')}</h1>
            <p className={styles.subtitle}>
              {t('lastUpdate')} {new Date().toLocaleDateString('fr-FR')}
            </p>
          </div>

          <div className={styles.content}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.object.title')}</h2>
              <p>{t('sections.object.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.orders.title')}</h2>
              <p>{t('sections.orders.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.delivery.title')}</h2>
              <p>{t('sections.delivery.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.payment.title')}</h2>
              <p>{t('sections.payment.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.withdrawal.title')}</h2>
              <p>{t('sections.withdrawal.content')}</p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('sections.warranty.title')}</h2>
              <p>{t('sections.warranty.content')}</p>
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
