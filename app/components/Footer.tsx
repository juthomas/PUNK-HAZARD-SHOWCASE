'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import styles from "./Footer.module.css";

export default function Footer() {
  const t = useTranslations('common');
  const tNav = useTranslations('common.nav');
  const tFooter = useTranslations('common.footer');
  const footerRef = useRef<HTMLElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const [spacerHeight, setSpacerHeight] = useState(400);

  useEffect(() => {
    const updateSpacerHeight = () => {
      if (footerRef.current && spacerRef.current) {
        const footerHeight = footerRef.current.offsetHeight;
        setSpacerHeight(footerHeight);
      }
    };

    updateSpacerHeight();
    window.addEventListener('resize', updateSpacerHeight);
    const resizeObserver = new ResizeObserver(updateSpacerHeight);
    if (footerRef.current) {
      resizeObserver.observe(footerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateSpacerHeight);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <>
      <div
        ref={spacerRef}
        className={styles.footerSpacer}
        style={{ height: `${spacerHeight}px` }}
      />
      <footer ref={footerRef} className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.footerContent}>
          <div className={styles.footerSection}>
            <h3 className={styles.footerTitle}>PUNK HAZARD</h3>
            <p className={styles.footerText}>
              {tFooter('description')}
            </p>
          </div>
          
          <div className={styles.footerSection}>
            <h4 className={styles.footerHeading}>{tFooter('navigation')}</h4>
            <ul className={styles.footerLinks}>
              <li><Link href="/">{tNav('home')}</Link></li>
              <li><Link href="/shop">{tNav('shop')}</Link></li>
              <li><Link href="/services">{tNav('services')}</Link></li>
              <li><Link href="/projects">{tNav('projects')}</Link></li>
              <li><Link href="/softwares">{tNav('softwares')}</Link></li>
            </ul>
          </div>
          
          <div className={styles.footerSection}>
            <h4 className={styles.footerHeading}>{tFooter('information')}</h4>
            <ul className={styles.footerLinks}>
              <li><Link href="/contact">{tNav('contact')}</Link></li>
              <li><Link href="/about">{t('about')}</Link></li>
              <li><Link href="/terms">{t('cgv')}</Link></li>
              <li><Link href="/legal">{t('legal')}</Link></li>
            </ul>
          </div>
        </div>
        
        <div className={styles.footerBottom}>
          <p>© {new Date().getFullYear()} PUNKHAZARD — {tFooter('rights')}</p>
        </div>
      </div>
    </footer>
    </>
  );
}
