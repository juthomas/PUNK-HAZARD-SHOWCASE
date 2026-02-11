import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import { buildPageMetadata } from '@/lib/seo';
import styles from './page.module.css';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'projects' });
  return buildPageMetadata({
    locale,
    pathSegment: 'projets',
    title: t('title'),
    description: t('subtitle'),
  });
}

export default function ProjetsPage() {
  const t = useTranslations('projects');
  const tHome = useTranslations('home.sections.projects');

  const projets = [
    {
      title: tHome('items.as-simt.title'),
      description: tHome('items.as-simt.description'),
      tags: ['Capteurs haptiques', 'PCB custom', 'ESP32', 'OSC'],
      events: [
        'Biennale de Gwangju',
        'IMPACT (Théâtre de Liège)',
        'HOT‑SHOP 14 (ECCO Leather)',
      ],
    },
    {
      title: tHome('items.go2.title'),
      description: tHome('items.go2.description'),
      tags: ['Unitree Go2', 'SDK', 'ROS2', 'Chorégraphie'],
      events: [],
    },
    {
      title: tHome('items.installations.title'),
      description: tHome('items.installations.description'),
      tags: ['Audio I2S', 'IMU 9 axes', 'DMX/Art‑Net', 'Synchronisation'],
      events: [],
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
            {projets.map((projet, index) => (
              <div key={index} className={styles.card}>
                <h3 className={styles.cardTitle}>{projet.title}</h3>
                <p className={styles.cardDescription}>{projet.description}</p>
                <div className={styles.tags}>
                  {projet.tags.map((tag, tagIndex) => (
                    <span key={tagIndex} className={styles.tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                {projet.events.length > 0 && (
                  <div className={styles.events}>
                    <strong>{t('presentations')}</strong>
                    <ul>
                      {projet.events.map((event, eventIndex) => (
                        <li key={eventIndex}>{event}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
