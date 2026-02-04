'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import styles from './LanguageSwitcher.module.css';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (newLocale: 'fr' | 'en') => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <div className={styles.switcher}>
      <button
        onClick={() => switchLocale('fr')}
        className={`${styles.button} ${locale === 'fr' ? styles.active : ''}`}
        aria-label="Switch to French"
      >
        FR
      </button>
      <button
        onClick={() => switchLocale('en')}
        className={`${styles.button} ${locale === 'en' ? styles.active : ''}`}
        aria-label="Switch to English"
      >
        EN
      </button>
    </div>
  );
}
