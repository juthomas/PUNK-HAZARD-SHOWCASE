import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import styles from './page.module.css';

export default function Home() {
  const t = useTranslations('home');
  const tCommon = useTranslations('common.cta');
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@punkhazard.org';

  const subject = t('badge').includes('Ingénierie') 
    ? 'Demande de devis — PUNKHAZARD' 
    : 'Quote request — PUNKHAZARD';

  return (
    <div className={styles.page}>
      <Header />
      <header className={styles.hero}>
        <div className={styles.container}>
          <span className={styles.badge}>{t('badge')}</span>
          <h1 className={`${styles.heroTitle} ${styles.balloon} ${styles.glitchTitle}`} data-text="PUNK HAZARD">
            {t('title')}
          </h1>
          <p className={`${styles.subtitle} ${styles.terminalLine}`}>
            {t('subtitle')}
          </p>
          <div className={styles.ctas}>
            <a
              className={styles.primary}
              href={`mailto:${contactEmail}?subject=${encodeURIComponent(subject)}`}
            >
              <span>{tCommon('requestQuote')}</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
        </div>
      </header>

      <main>
        <section id="services" className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>{t('sections.services.title')}</h2>
            <div className={styles.grid}>
              <div className={styles.card}>
                <h3>{t('sections.services.items.pcb.title')}</h3>
                <p>{t('sections.services.items.pcb.description')}</p>
                <ul>
                  {t.raw('sections.services.items.pcb.features').map((feature: string, i: number) => (
                    <li key={i}>{feature}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.card}>
                <h3>{t('sections.services.items.electronics.title')}</h3>
                <p>{t('sections.services.items.electronics.description')}</p>
                <ul>
                  {t.raw('sections.services.items.electronics.features').map((feature: string, i: number) => (
                    <li key={i}>{feature}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.card}>
                <h3>{t('sections.services.items.integration.title')}</h3>
                <p>{t('sections.services.items.integration.description')}</p>
                <ul>
                  {t.raw('sections.services.items.integration.features').map((feature: string, i: number) => (
                    <li key={i}>{feature}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.card}>
                <h3>{t('sections.services.items.go2.title')}</h3>
                <p>{t('sections.services.items.go2.description')}</p>
                <ul>
                  {t.raw('sections.services.items.go2.features').map((feature: string, i: number) => (
                    <li key={i}>{feature}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="boutique" className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>{t('sections.shop.title')}</h2>
            <p className={styles.sectionSubtitle}>{t('sections.shop.subtitle')}</p>
            <div className={styles.productGrid}>
              <div className={styles.productCard}>
                <div className={styles.productImagePlaceholder}>
                  <span>Image produit</span>
                </div>
                <h3 className={styles.productName}>{t('sections.shop.products.as-simt.name')}</h3>
                <p className={styles.productDescription}>{t('sections.shop.products.as-simt.description')}</p>
                <p className={styles.productPrice}>{t('sections.shop.price.coming')}</p>
              </div>
              <div className={styles.productCard}>
                <div className={styles.productImagePlaceholder}>
                  <span>Image produit</span>
                </div>
                <h3 className={styles.productName}>{t('sections.shop.products.audio.name')}</h3>
                <p className={styles.productDescription}>{t('sections.shop.products.audio.description')}</p>
                <p className={styles.productPrice}>{t('sections.shop.price.coming')}</p>
              </div>
              <div className={styles.productCard}>
                <div className={styles.productImagePlaceholder}>
                  <span>Image produit</span>
                </div>
                <h3 className={styles.productName}>{t('sections.shop.products.pcb.name')}</h3>
                <p className={styles.productDescription}>{t('sections.shop.products.pcb.description')}</p>
                <p className={styles.productPrice}>{t('sections.shop.price.quote')}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="realisations" className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>{t('sections.projects.title')}</h2>
            <div className={styles.workGrid}>
              <div className={styles.card}>
                <h3>{t('sections.projects.items.as-simt.title')}</h3>
                <div className={styles.workMeta}>
                  <span className={styles.tag}>Capteurs haptiques</span>
                  <span className={styles.tag}>PCB custom</span>
                  <span className={styles.tag}>ESP32</span>
                  <span className={styles.tag}>OSC</span>
                </div>
                <p>{t('sections.projects.items.as-simt.description')}</p>
              </div>

              <div className={styles.card}>
                <h3>{t('sections.projects.items.go2.title')}</h3>
                <div className={styles.workMeta}>
                  <span className={styles.tag}>Unitree Go2</span>
                  <span className={styles.tag}>SDK</span>
                  <span className={styles.tag}>ROS2</span>
                  <span className={styles.tag}>Chorégraphie</span>
                </div>
                <p>{t('sections.projects.items.go2.description')}</p>
              </div>

              <div className={styles.card}>
                <h3>{t('sections.projects.items.installations.title')}</h3>
                <div className={styles.workMeta}>
                  <span className={styles.tag}>Audio I2S</span>
                  <span className={styles.tag}>IMU 9 axes</span>
                  <span className={styles.tag}>DMX/Art‑Net</span>
                  <span className={styles.tag}>Synchronisation</span>
                </div>
                <p>{t('sections.projects.items.installations.description')}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="expertise" className={styles.sectionAlt}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>{t('sections.expertise.title')}</h2>
            <div className={styles.chips}>
              <span className={styles.chip}>KiCad</span>
              <span className={styles.chip}>STM32</span>
              <span className={styles.chip}>ESP32</span>
              <span className={styles.chip}>C/C++</span>
              <span className={styles.chip}>Rust</span>
              <span className={styles.chip}>Python</span>
              <span className={styles.chip}>ROS/ROS2</span>
              <span className={styles.chip}>BLE</span>
              <span className={styles.chip}>Wi‑Fi</span>
              <span className={styles.chip}>LoRa</span>
              <span className={styles.chip}>OSC</span>
              <span className={styles.chip}>I2S</span>
              <span className={styles.chip}>IMU 9 axes</span>
              <span className={styles.chip}>MQTT</span>
              <span className={styles.chip}>Unitree Go2</span>
              <span className={styles.chip}>Unitree SDK</span>
            </div>
          </div>
        </section>

        <section id="processus" className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>{t('sections.process.title')}</h2>
            <ol className={styles.steps}>
              <li>
                <strong>{t('sections.process.steps.discovery').split(' — ')[0]}</strong>
                <span> — {t('sections.process.steps.discovery').split(' — ')[1]}</span>
              </li>
              <li>
                <strong>{t('sections.process.steps.design').split(' — ')[0]}</strong>
                <span> — {t('sections.process.steps.design').split(' — ')[1]}</span>
              </li>
              <li>
                <strong>{t('sections.process.steps.prototype').split(' — ')[0]}</strong>
                <span> — {t('sections.process.steps.prototype').split(' — ')[1]}</span>
              </li>
              <li>
                <strong>{t('sections.process.steps.industrialization').split(' — ')[0]}</strong>
                <span> — {t('sections.process.steps.industrialization').split(' — ')[1]}</span>
              </li>
            </ol>
          </div>
        </section>

        <section id="partenaires" className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>{t('sections.collaborations.title')}</h2>
            <div className={`${styles.grid} ${styles.gridTwoCols}`}>
              <div className={styles.card}>
                <h3>{t('sections.collaborations.nsdos.title')}</h3>
                <p>{t('sections.collaborations.nsdos.description')}</p>
              </div>
              <div className={styles.card}>
                <h3>{t('sections.collaborations.festivals.title')}</h3>
                <p>{t('sections.collaborations.festivals.description')}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className={styles.sectionAlt}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>{t('sections.contact.title')}</h2>
            <p className={styles.contactText}>{t('sections.contact.description')}</p>
            <div className={styles.ctas}>
              <Link
                className={styles.primary}
                href="/contact"
              >
                {tCommon('contact')}
              </Link>
            </div>
            <p className={styles.contactLine}>
              <span>{t('sections.contact.email')}</span>
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
