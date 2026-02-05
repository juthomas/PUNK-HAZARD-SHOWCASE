'use client';

import { useCartStore } from '@/app/store/cartStore';
import { useTranslations } from 'next-intl';
import styles from './CartIcon.module.css';

type CartIconProps = {
  onClick: () => void;
};

export default function CartIcon({ onClick }: CartIconProps) {
  const totalItems = useCartStore((state) => state.getTotalItems());
  const t = useTranslations('cart');

  return (
    <button onClick={onClick} className={styles.cartIcon} aria-label={t('title')}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 3H5L5.4 5M7 13H17L21 5H5.4M7 13L5.4 5M7 13L4.7 15.3C4.3 15.7 4.6 16.5 5.1 16.5H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="6" cy="19" r="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <circle cx="17" cy="19" r="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
      <span className={styles.cartLabel}>{t('title')}</span>
      {totalItems > 0 && (
        <span className={styles.badge}>{totalItems}</span>
      )}
    </button>
  );
}
