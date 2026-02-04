'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { useCartStore } from '@/app/store/cartStore';
import styles from './Cart.module.css';

type CartItemImageProps = {
  src: string;
  alt: string;
};

function CartItemImage({ src, alt }: CartItemImageProps) {
  const [imageError, setImageError] = useState(false);
  const [hasTriedPlaceholder, setHasTriedPlaceholder] = useState(false);

  const imageSrc = imageError || !src || src.trim() === '' 
    ? '/products/placeholder.svg' 
    : src;

  return (
    <Image
      src={imageSrc}
      alt={alt}
      fill
      className={styles.itemImageContent}
      sizes="80px"
      onError={() => {
        if (!hasTriedPlaceholder && !imageError) {
          setImageError(true);
          setHasTriedPlaceholder(true);
        }
        // Ne pas essayer à nouveau si le placeholder échoue aussi
      }}
    />
  );
}

export default function Cart() {
  const t = useTranslations('cart');
  const locale = useLocale() as 'fr' | 'en';
  const { items, removeItem, updateQuantity, getTotalPrice, clearCart } = useCartStore();

  const handleCheckout = () => {
    // TODO: Rediriger vers la page de checkout
    // router.push('/checkout');
    alert(t('checkoutComing'));
  };

  if (items.length === 0) {
    return (
      <div className={styles.cart}>
        <div className={styles.emptyCart}>
          <p>{t('empty')}</p>
        </div>
      </div>
    );
  }

  const total = getTotalPrice();

  return (
    <div className={styles.cart}>
      <div className={styles.cartHeader}>
        <h2>{t('title')}</h2>
        <button onClick={clearCart} className={styles.clearButton}>
          {t('clear')}
        </button>
      </div>

      <div className={styles.cartItems}>
        {items.map((item) => {
          const name = item.name[locale] || item.name.fr;
          const priceDisplay = item.price === 'coming' 
            ? t('price.coming') 
            : item.price === 'quote' 
            ? t('price.quote')
            : item.price;

          return (
            <div key={item.productId} className={styles.cartItem}>
              <div className={styles.itemImage}>
                <CartItemImage src={item.image} alt={name} />
              </div>
              <div className={styles.itemDetails}>
                <h3>{name}</h3>
                <p className={styles.itemPrice}>{priceDisplay}</p>
                <div className={styles.quantityControls}>
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    className={styles.quantityButton}
                  >
                    −
                  </button>
                  <span className={styles.quantity}>{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    className={styles.quantityButton}
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                onClick={() => removeItem(item.productId)}
                className={styles.removeButton}
                aria-label={t('remove')}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <div className={styles.cartFooter}>
        <div className={styles.total}>
          <span>{t('total')}</span>
          <span className={styles.totalPrice}>
            {total > 0 ? `${total.toFixed(2)} €` : t('price.quote')}
          </span>
        </div>
        <button onClick={handleCheckout} className={styles.checkoutButton}>
          {t('checkout')}
        </button>
      </div>
    </div>
  );
}
