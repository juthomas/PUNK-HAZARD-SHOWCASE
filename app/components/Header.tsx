'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import LanguageSwitcher from './LanguageSwitcher';
import styles from "./Header.module.css";

export default function Header() {
  const t = useTranslations('common.nav');

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          PUNK HAZARD
        </Link>
        <nav className={styles.nav}>
          <Link href="/" className={styles.navLink}>
            {t('home')}
          </Link>
          <Link href="/boutique" className={styles.navLink}>
            {t('shop')}
          </Link>
          <Link href="/services" className={styles.navLink}>
            {t('services')}
          </Link>
          <Link href="/projets" className={styles.navLink}>
            {t('projects')}
          </Link>
          <Link href="/contact" className={styles.navLink}>
            {t('contact')}
          </Link>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
