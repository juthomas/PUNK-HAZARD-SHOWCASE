'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useCartStore } from '@/app/store/cartStore';
import styles from './ProductCard.module.css';

export type Product = {
  id: number;
  name: {
    fr: string;
    en: string;
  };
  description: {
    fr: string;
    en: string;
  };
  image: string;
  price: 'coming' | 'quote' | string | number; // 'coming', 'quote', or actual price like "150€" or 150
  tags: string[];
};

type ProductCardProps = {
  product: Product;
};

export default function ProductCard({ product }: ProductCardProps) {
  const t = useTranslations('shop');
  const tCart = useTranslations('cart');
  const tCommon = useTranslations('common.cta');
  const locale = useLocale() as 'fr' | 'en';
  const [imageError, setImageError] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  const name = product.name[locale] || product.name.fr;
  const description = product.description[locale] || product.description.fr;

  const getPriceDisplay = () => {
    if (product.price === 'coming') {
      return t('price.coming');
    }
    if (product.price === 'quote') {
      return t('price.quote');
    }
    if (typeof product.price === 'number') {
      return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
      }).format(product.price);
    }
    return product.price;
  };

  // Use placeholder if no image specified, image is empty, or image failed to load
  const imageSrc = imageError || !product.image || product.image.trim() === ''
    ? '/products/placeholder.svg' 
    : product.image;

  return (
    <div className={styles.card}>
      <div className={styles.imageContainer}>
        <Image
          src={imageSrc}
          alt={name}
          fill
          className={styles.image}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          onError={() => setImageError(true)}
        />
      </div>
      <div className={styles.content}>
        <h3 className={styles.name}>{name}</h3>
        <p className={styles.description}>{description}</p>
        {product.tags.length > 0 && (
          <div className={styles.tags}>
            {product.tags.map((tag, index) => (
              <span key={index} className={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className={styles.footer}>
          <p className={styles.price}>{getPriceDisplay()}</p>
          {product.price === 'quote' ? (
            <Link
              href={{
                pathname: '/contact',
                query: { subject: 'Devis' },
              }}
              className={styles.quoteButton}
            >
              {tCommon('requestQuote')}
            </Link>
          ) : product.price === 'coming' ? (
            <button
              disabled
              className={`${styles.addToCartButton} ${styles.addToCartButtonDisabled}`}
            >
              {tCart('addToCart')}
            </button>
          ) : (
            <button
              onClick={() => addItem({
                productId: product.id,
                name: product.name,
                price: product.price,
                image: product.image,
              })}
              className={styles.addToCartButton}
            >
              {tCart('addToCart')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
