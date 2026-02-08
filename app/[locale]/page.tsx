'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import ProductCarousel from '@/app/components/ProductCarousel';
import { Product } from '@/app/components/ProductCard';
import productsData from '@/data/products.json';
import styles from './page.module.css';

export default function Home() {
  const t = useTranslations('home');
  const tCommon = useTranslations('common.cta');
  const router = useRouter();
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@punkhazard.org';
  const [glitchIntensity, setGlitchIntensity] = useState<'normal' | 'moderate' | 'intense' | 'extreme' | 'crazy'>('normal');
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const intensityIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const initialPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressingRef = useRef<boolean>(false);

  // Convert JSON data to Product type
  const products: Product[] = productsData.map((product) => ({
    ...product,
    name: product.name as { fr: string; en: string },
    description: product.description as { fr: string; en: string },
  }));


  const handleLongPressStart = () => {
    if (isLongPressingRef.current) return; // Éviter les doubles déclenchements
    isLongPressingRef.current = true;
    startTimeRef.current = Date.now();
    setGlitchIntensity('moderate');
    
    // Augmenter progressivement l'intensité sur 10 secondes
    intensityIntervalRef.current = setInterval(() => {
      if (!startTimeRef.current || !isLongPressingRef.current) return;
      
      const elapsed = Date.now() - startTimeRef.current;
      
      if (elapsed < 2000) {
        setGlitchIntensity('moderate');
      } else if (elapsed < 4500) {
        setGlitchIntensity('intense');
      } else if (elapsed < 7500) {
        setGlitchIntensity('extreme');
      } else {
        setGlitchIntensity('crazy');
      }
    }, 100);
    
    // Déclencher l'action après 10 secondes
    longPressTimerRef.current = setTimeout(() => {
      if (intensityIntervalRef.current) {
        clearInterval(intensityIntervalRef.current);
        intensityIntervalRef.current = null;
      }
      if (pointerIdRef.current !== null && titleRef.current) {
        try {
          titleRef.current.releasePointerCapture(pointerIdRef.current);
        } catch (e) {
          // Ignore si le pointer n'est plus actif
        }
        pointerIdRef.current = null;
      }
      initialPointerPosRef.current = null;
      isLongPressingRef.current = false;
      startTimeRef.current = null;
      setGlitchIntensity('normal');
      router.push('/shutdown');
    }, 10000);
  };

  const handleLongPressEnd = () => {
    if (!isLongPressingRef.current) return; // Éviter les doubles arrêts
    isLongPressingRef.current = false;
    setGlitchIntensity('normal');
    
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    if (intensityIntervalRef.current) {
      clearInterval(intensityIntervalRef.current);
      intensityIntervalRef.current = null;
    }
    
    if (pointerIdRef.current !== null && titleRef.current) {
      try {
        titleRef.current.releasePointerCapture(pointerIdRef.current);
      } catch (e) {
        // Ignore si le pointer n'est plus actif
      }
      pointerIdRef.current = null;
    }
    
    initialPointerPosRef.current = null;
    startTimeRef.current = null;
  };

  useEffect(() => {
    const timer = longPressTimerRef.current;
    const interval = intensityIntervalRef.current;
    
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  return (
    <div className={styles.page}>
      <Header />
      {glitchIntensity === 'crazy' && (
        <div className={styles.glitchOverlay} aria-hidden="true">
          <span className={styles.scanline} />
          <span className={styles.noiseOverlay} />
          <span className={styles.vignette} />
        </div>
      )}
      <header className={styles.hero}>
        <div className={styles.container}>
          <span className={styles.badge}>{t('badge')}</span>
          <h1 
            ref={titleRef}
            className={`${styles.heroTitle} ${styles.balloon} ${styles.glitchTitle} ${
              glitchIntensity === 'moderate' ? styles.glitchModerate :
              glitchIntensity === 'intense' ? styles.glitchIntense :
              glitchIntensity === 'extreme' ? styles.glitchExtreme :
              glitchIntensity === 'crazy' ? styles.glitchCrazy : ''
            }`}
            data-text="PUNK HAZARD"
            onTouchStart={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (event.touches.length === 1) {
                const touch = event.touches[0];
                initialPointerPosRef.current = { x: touch.clientX, y: touch.clientY };
                handleLongPressStart();
              }
            }}
            onTouchEnd={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleLongPressEnd();
            }}
            onTouchCancel={(event) => {
              event.preventDefault();
              event.stopPropagation();
              // Vérifier si le mouvement est petit avant d'annuler
              if (event.changedTouches.length > 0 && initialPointerPosRef.current) {
                const touch = event.changedTouches[0];
                const dx = touch.clientX - initialPointerPosRef.current.x;
                const dy = touch.clientY - initialPointerPosRef.current.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Si le mouvement est trop grand, annuler
                if (distance > 150) {
                  handleLongPressEnd();
                }
                // Sinon, ignorer le cancel (petit mouvement)
              } else {
                handleLongPressEnd();
              }
            }}
            onTouchMove={(event) => {
              // Vérifier la distance depuis la position initiale
              if (event.touches.length > 0 && initialPointerPosRef.current && isLongPressingRef.current) {
                const touch = event.touches[0];
                const dx = touch.clientX - initialPointerPosRef.current.x;
                const dy = touch.clientY - initialPointerPosRef.current.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Si le mouvement est trop grand, annuler
                if (distance > 150) {
                  event.preventDefault();
                  handleLongPressEnd();
                }
              }
            }}
            onPointerDown={(event) => {
              // Pour les souris, utiliser pointer events
              if (event.pointerType === 'mouse') {
                event.preventDefault();
                event.stopPropagation();
                pointerIdRef.current = event.pointerId;
                initialPointerPosRef.current = { x: event.clientX, y: event.clientY };
                const element = event.currentTarget;
                element.setPointerCapture(event.pointerId);
                handleLongPressStart();
              }
            }}
            onPointerUp={(event) => {
              if (event.pointerType === 'mouse' && pointerIdRef.current === event.pointerId) {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.releasePointerCapture(event.pointerId);
                pointerIdRef.current = null;
                initialPointerPosRef.current = null;
                handleLongPressEnd();
              }
            }}
            onPointerCancel={(event) => {
              if (event.pointerType === 'mouse' && pointerIdRef.current === event.pointerId) {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.releasePointerCapture(event.pointerId);
                pointerIdRef.current = null;
                initialPointerPosRef.current = null;
                handleLongPressEnd();
              }
            }}
            onPointerMove={(event) => {
              // Pour les souris uniquement
              if (event.pointerType === 'mouse' && pointerIdRef.current === event.pointerId && startTimeRef.current !== null) {
                if (initialPointerPosRef.current) {
                  const dx = event.clientX - initialPointerPosRef.current.x;
                  const dy = event.clientY - initialPointerPosRef.current.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);
                  
                  if (distance > 150) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    pointerIdRef.current = null;
                    initialPointerPosRef.current = null;
                    handleLongPressEnd();
                  }
                }
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <span className={styles.glitchTitleText}>{t('title')}</span>
          </h1>
          <p className={`${styles.subtitle} ${styles.terminalLine}`}>
            {t('subtitle')}
          </p>
          <div className={styles.heroSplit}>
            <Link href="/boutique" className={styles.splitCard}>
              <div className={styles.splitImage}>
                <Image
                  src="/products/placeholder.svg"
                  alt={t('sections.shop.title')}
                  fill
                  sizes="(max-width: 820px) 100vw, 50vw"
                />
              </div>
              <div className={styles.splitContent}>
                <span className={styles.splitTitle}>{t('sections.shop.title')}</span>
                <div className={styles.splitMeta}>
                  <span className={styles.splitSubtitle}>{t('heroSplit.shop')}</span>
                  <span className={styles.splitButton}>{tCommon('viewShop')}</span>
                </div>
              </div>
            </Link>
            <Link href="/services" className={styles.splitCard}>
              <div className={styles.splitImage}>
                <Image
                  src="/products/placeholder.svg"
                  alt={t('sections.services.title')}
                  fill
                  sizes="(max-width: 820px) 100vw, 50vw"
                />
              </div>
              <div className={styles.splitContent}>
                <span className={styles.splitTitle}>{t('sections.services.title')}</span>
                <div className={styles.splitMeta}>
                  <span className={styles.splitSubtitle}>{t('heroSplit.services')}</span>
                  <span className={styles.splitButton}>{tCommon('viewServices')}</span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <div className={styles.splitLayout}>
          <div className={styles.splitColumn} data-side="left">
            <section id="services" className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>{t('sections.services.title')}</h2>
            <div className={styles.grid}>
              <div className={styles.card}>
                <div className={styles.cardImage}>
                  <Image
                    src="/products/placeholder.svg"
                    alt={t('sections.services.items.pcb.title')}
                    fill
                    sizes="(max-width: 960px) 100vw, 33vw"
                  />
                </div>
                <h3>{t('sections.services.items.pcb.title')}</h3>
                <p>{t('sections.services.items.pcb.description')}</p>
                <ul>
                  {t.raw('sections.services.items.pcb.features').map((feature: string, i: number) => (
                    <li key={i}>{feature}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.card}>
                <div className={styles.cardImage}>
                  <Image
                    src="/products/placeholder.svg"
                    alt={t('sections.services.items.electronics.title')}
                    fill
                    sizes="(max-width: 960px) 100vw, 33vw"
                  />
                </div>
                <h3>{t('sections.services.items.electronics.title')}</h3>
                <p>{t('sections.services.items.electronics.description')}</p>
                <ul>
                  {t.raw('sections.services.items.electronics.features').map((feature: string, i: number) => (
                    <li key={i}>{feature}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.card}>
                <div className={styles.cardImage}>
                  <Image
                    src="/products/placeholder.svg"
                    alt={t('sections.services.items.integration.title')}
                    fill
                    sizes="(max-width: 960px) 100vw, 33vw"
                  />
                </div>
                <h3>{t('sections.services.items.integration.title')}</h3>
                <p>{t('sections.services.items.integration.description')}</p>
                <ul>
                  {t.raw('sections.services.items.integration.features').map((feature: string, i: number) => (
                    <li key={i}>{feature}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.card}>
                <div className={styles.cardImage}>
                  <Image
                    src="/products/placeholder.svg"
                    alt={t('sections.services.items.design.title')}
                    fill
                    sizes="(max-width: 960px) 100vw, 33vw"
                  />
                </div>
                <h3>{t('sections.services.items.design.title')}</h3>
                <p>{t('sections.services.items.design.description')}</p>
                <ul>
                  {t.raw('sections.services.items.design.features').map((feature: string, i: number) => (
                    <li key={i}>{feature}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.card}>
                <div className={styles.cardImage}>
                  <Image
                    src="/products/placeholder.svg"
                    alt={t('sections.services.items.scenography.title')}
                    fill
                    sizes="(max-width: 960px) 100vw, 33vw"
                  />
                </div>
                <h3>{t('sections.services.items.scenography.title')}</h3>
                <p>{t('sections.services.items.scenography.description')}</p>
                <ul>
                  {t.raw('sections.services.items.scenography.features').map((feature: string, i: number) => (
                    <li key={i}>{feature}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.card}>
                <div className={styles.cardImage}>
                  <Image
                    src="/products/placeholder.svg"
                    alt={t('sections.services.items.go2.title')}
                    fill
                    sizes="(max-width: 960px) 100vw, 33vw"
                  />
                </div>
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

        <section id="realisations" className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>{t('sections.projects.title')}</h2>
            <div className={styles.workGrid}>
              <div className={styles.card}>
                <div className={styles.cardImage}>
                  <Image
                    src="/products/placeholder.svg"
                    alt={t('sections.projects.items.as-simt.title')}
                    fill
                    sizes="(max-width: 960px) 100vw, 33vw"
                  />
                </div>
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
                <div className={styles.cardImage}>
                  <Image
                    src="/products/placeholder.svg"
                    alt={t('sections.projects.items.go2.title')}
                    fill
                    sizes="(max-width: 960px) 100vw, 33vw"
                  />
                </div>
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
                <div className={styles.cardImage}>
                  <Image
                    src="/products/placeholder.svg"
                    alt={t('sections.projects.items.installations.title')}
                    fill
                    sizes="(max-width: 960px) 100vw, 33vw"
                  />
                </div>
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
          </div>

          <div className={styles.splitColumn} data-side="right">
            <section id="boutique" className={styles.section}>
              <div className={styles.container}>
                <h2 className={styles.sectionTitle}>{t('sections.shop.title')}</h2>
                <p className={styles.sectionSubtitle}>{t('sections.shop.subtitle')}</p>
                <ProductCarousel products={products} />
              </div>
            </section>
          </div>
        </div>

        <section id="expertise" className={styles.sectionAlt}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>{t('sections.expertise.title')}</h2>
            <div className={styles.chips}>
              <span className={styles.chip}>KiCad</span>
              <span className={styles.chip}>STM32</span>
              <span className={styles.chip}>ESP32</span>
              <span className={styles.chip}>C/C++</span>
              <span className={styles.chip}>TypeScript</span>
              <span className={styles.chip}>React</span>
              <span className={styles.chip}>Shaders</span>
              <span className={styles.chip}>Three.js</span>
              <span className={styles.chip}>Native Apps</span>
              <span className={styles.chip}>Python</span>
              <span className={styles.chip}>Rust</span>
              <span className={styles.chip}>BLE</span>
              <span className={styles.chip}>Wi‑Fi</span>
              <span className={styles.chip}>LoRa</span>
              <span className={styles.chip}>OSC</span>
              <span className={styles.chip}>UDP</span>
              <span className={styles.chip}>I2S</span>
              <span className={styles.chip}>DMX/Art‑Net</span>
              <span className={styles.chip}>ROS/ROS2</span>
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
