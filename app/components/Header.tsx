'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link, usePathname } from '@/i18n/routing';
import LanguageSwitcher from './LanguageSwitcher';
import CartIcon from './CartIcon';
import Cart from './Cart';
import LoginModal from './LoginModal';
import UserMenu from './UserMenu';
import styles from "./Header.module.css";

export default function Header() {
  const t = useTranslations('common.nav');
  const tAuth = useTranslations('auth');
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Bloquer le scroll du body quand une modale est ouverte
  useEffect(() => {
    if (isCartOpen || isLoginOpen) {
      // Sauvegarder la position actuelle du scroll
      const scrollY = window.scrollY;
      // Bloquer le scroll
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restaurer le scroll quand la modale se ferme
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isCartOpen, isLoginOpen]);

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
          <CartIcon onClick={() => setIsCartOpen(true)} />
          {session ? (
            <UserMenu />
          ) : (
            <button onClick={() => setIsLoginOpen(true)} className={styles.loginButton}>
              {tAuth('login')}
            </button>
          )}
        </nav>
      </div>
      {mounted && isCartOpen && createPortal(
        <div className={styles.cartModal} onClick={() => setIsCartOpen(false)}>
          <div className={styles.cartModalContent} onClick={(e) => e.stopPropagation()}>
            <Cart />
            <button className={styles.closeCartButton} onClick={() => setIsCartOpen(false)}>
              ×
            </button>
          </div>
        </div>,
        document.body
      )}
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </header>
  );
}
