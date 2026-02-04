'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
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
  price: 'coming' | 'quote' | string; // 'coming', 'quote', or actual price like "150€"
  tags: string[];
};

type ProductCardProps = {
  product: Product;
};

export default function ProductCard({ product }: ProductCardProps) {
  const t = useTranslations('shop');
  const locale = useLocale() as 'fr' | 'en';
  const [imageError, setImageError] = useState(false);

  const name = product.name[locale] || product.name.fr;
  const description = product.description[locale] || product.description.fr;

  const getPriceDisplay = () => {
    if (product.price === 'coming') {
      return t('price.coming');
    }
    if (product.price === 'quote') {
      return t('price.quote');
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
        <p className={styles.price}>{getPriceDisplay()}</p>
      </div>
    </div>
  );
}
