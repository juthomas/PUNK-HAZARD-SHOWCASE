'use client';

import { useSession, signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import styles from './UserMenu.module.css';

export default function UserMenu() {
  const { data: session, status } = useSession();
  const t = useTranslations('auth');

  if (status === 'loading') {
    return null;
  }

  if (!session) {
    return null;
  }

  return (
    <div className={styles.userMenu}>
      <span className={styles.userEmail}>{session.user?.email}</span>
      <button onClick={() => signOut()} className={styles.logoutButton}>
        {t('logout')}
      </button>
    </div>
  );
}
