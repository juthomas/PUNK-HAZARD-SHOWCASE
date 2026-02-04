'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import LanguageSwitcher from './LanguageSwitcher';
import styles from "./Header.module.css";

export default function Header() {
  const t = useTranslations('common.nav');
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/' || pathname === '/fr' || pathname === '/en';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          PUNK HAZARD
        </Link>
        <nav className={styles.nav}>
          <Link href="/" className={`${styles.navLink} ${isActive('/') ? styles.active : ''}`}>
            {t('home')}
          </Link>
          <Link href="/boutique" className={`${styles.navLink} ${isActive('/boutique') ? styles.active : ''}`}>
            {t('shop')}
          </Link>
          <Link href="/services" className={`${styles.navLink} ${isActive('/services') ? styles.active : ''}`}>
            {t('services')}
          </Link>
          <Link href="/projets" className={`${styles.navLink} ${isActive('/projets') ? styles.active : ''}`}>
            {t('projects')}
          </Link>
          <Link href="/contact" className={`${styles.navLink} ${isActive('/contact') ? styles.active : ''}`}>
            {t('contact')}
          </Link>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
