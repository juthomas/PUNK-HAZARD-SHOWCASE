'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import { useRouter } from '@/i18n/routing';
import { useCartStore } from '@/app/store/cartStore';
import { useOrdersStore } from '@/app/store/ordersStore';
import styles from './DeleteAccountModal.module.css';

type DeleteAccountModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
};

export default function DeleteAccountModal({ isOpen, onClose, userId }: DeleteAccountModalProps) {
  const t = useTranslations('profile.deleteAccount');
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const clearCart = useCartStore((state) => state.clearCart);
  const deleteOrdersByUser = useOrdersStore((state) => state.deleteOrdersByUser);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    
    try {
      // Supprimer les données locales
      clearCart();
      deleteOrdersByUser(userId);
      
      // Supprimer les données du localStorage
      localStorage.removeItem('cart-storage');
      localStorage.removeItem('orders-storage');
      
      // Déconnecter l'utilisateur
      await signOut({ redirect: false });
      
      // Rediriger vers la page d'accueil
      router.push('/');
    } catch (error) {
      console.error('Erreur lors de la suppression du compte:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 className={styles.title}>{t('title')}</h2>
        <p className={styles.message}>{t('message')}</p>
        
        <div className={styles.actions}>
          <button
            onClick={onClose}
            className={styles.cancelButton}
            disabled={isDeleting}
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleDelete}
            className={styles.deleteButton}
            disabled={isDeleting}
          >
            {isDeleting ? t('deleting') : t('confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
