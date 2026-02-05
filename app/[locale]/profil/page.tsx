'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import DeleteAccountModal from '@/app/components/DeleteAccountModal';
import { useOrdersStore } from '@/app/store/ordersStore';
import styles from './page.module.css';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations('profile');
  const tInfo = useTranslations('profile.sections.info');
  const tOrders = useTranslations('profile.sections.orders');
  const getOrdersByUser = useOrdersStore((state) => state.getOrdersByUser);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // Rediriger si non connecté
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className={styles.page}>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <div className={styles.loading}>Chargement...</div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const orders = getOrdersByUser(session.user?.id || '');

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(price);
  };

  const getStatusLabel = (status: string) => {
    return tOrders(`statuses.${status as any}`);
  };

  const getStatusClass = (status: string) => {
    return styles[`status${status.charAt(0).toUpperCase() + status.slice(1)}`];
  };

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>{t('title')}</h1>
            <p className={styles.subtitle}>{t('subtitle')}</p>
          </div>

          <div className={styles.content}>
            {/* Section Informations personnelles */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{tInfo('title')}</h2>
              <div className={styles.infoCard}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>{tInfo('email')}</span>
                  <span className={styles.infoValue}>{session.user?.email || '-'}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>{tInfo('name')}</span>
                  <span className={styles.infoValue}>{session.user?.name || '-'}</span>
                </div>
                <div className={styles.dangerZone}>
                  <div className={styles.dangerZoneHeader}>
                    <h3 className={styles.dangerZoneTitle}>{tInfo('dangerZone')}</h3>
                    <p className={styles.dangerZoneWarning}>{tInfo('deleteAccountWarning')}</p>
                  </div>
                  <button
                    onClick={() => setIsDeleteModalOpen(true)}
                    className={styles.deleteAccountButton}
                  >
                    {tInfo('deleteAccount')}
                  </button>
                </div>
              </div>
            </section>

            {/* Section Commandes */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{tOrders('title')}</h2>
              
              {orders.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>{tOrders('empty')}</p>
                </div>
              ) : (
                <div className={styles.ordersList}>
                  {orders.map((order) => (
                    <div key={order.id} className={styles.orderCard}>
                      <div className={styles.orderHeader}>
                        <div className={styles.orderInfo}>
                          <span className={styles.orderNumber}>
                            {tOrders('orderNumber')} {order.orderNumber}
                          </span>
                          <span className={styles.orderDate}>
                            {formatDate(order.date)}
                          </span>
                        </div>
                        <div className={styles.orderMeta}>
                          <span className={`${styles.orderStatus} ${getStatusClass(order.status)}`}>
                            {getStatusLabel(order.status)}
                          </span>
                          <span className={styles.orderTotal}>
                            {formatPrice(order.total)}
                          </span>
                        </div>
                      </div>
                      
                      <div className={styles.orderItems}>
                        {order.items.map((item, index) => (
                          <div key={index} className={styles.orderItem}>
                            <div className={styles.orderItemImage}>
                              {item.image ? (
                                <img src={item.image} alt={item.name.fr} />
                              ) : (
                                <div className={styles.orderItemPlaceholder}>
                                  {item.name.fr.charAt(0)}
                                </div>
                              )}
                            </div>
                            <div className={styles.orderItemInfo}>
                              <span className={styles.orderItemName}>
                                {item.name.fr}
                              </span>
                              <span className={styles.orderItemQuantity}>
                                x{item.quantity}
                              </span>
                            </div>
                            <div className={styles.orderItemPrice}>
                              {item.price === 'coming' || item.price === 'quote' ? (
                                <span className={styles.orderItemPriceSpecial}>
                                  {item.price === 'coming' ? 'À venir' : 'Sur devis'}
                                </span>
                              ) : (
                                formatPrice(parseFloat(item.price.replace(/[^\d.,]/g, '').replace(',', '.')) * item.quantity)
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
      <Footer />
      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        userId={session.user?.id || ''}
      />
    </div>
  );
}
