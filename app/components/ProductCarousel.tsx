'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import ProductCard, { Product } from './ProductCard';
import styles from './ProductCarousel.module.css';

type ProductCarouselProps = {
  products: Product[];
};

export default function ProductCarousel({ products }: ProductCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [itemsPerView, setItemsPerView] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const t = useTranslations('shop');

  useEffect(() => {
    const updateItemsPerView = () => {
      const width = window.innerWidth;
      if (width >= 1200) {
        setItemsPerView(3);
      } else if (width >= 820) {
        setItemsPerView(2);
      } else {
        setItemsPerView(1);
      }
    };

    updateItemsPerView();
    window.addEventListener('resize', updateItemsPerView);
    return () => window.removeEventListener('resize', updateItemsPerView);
  }, []);

  // Carrousel infini : on peut aller au-delà des limites
  const goToPrevious = () => {
    setCurrentIndex((prev) => {
      if (prev <= 0) {
        // Si on est au début, on va à la fin (effet infini)
        return products.length - itemsPerView;
      }
      return prev - 1;
    });
    setIsPaused(true);
    // Reprendre l'auto-play après 5 secondes d'inactivité
    setTimeout(() => setIsPaused(false), 5000);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => {
      const maxIndex = Math.max(0, products.length - itemsPerView);
      if (prev >= maxIndex) {
        // Si on est à la fin, on revient au début (effet infini)
        return 0;
      }
      return prev + 1;
    });
    setIsPaused(true);
    // Reprendre l'auto-play après 5 secondes d'inactivité
    setTimeout(() => setIsPaused(false), 5000);
  };

  // Auto-play : changement automatique toutes les 15 secondes
  useEffect(() => {
    if (isPaused || products.length <= itemsPerView) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const maxIndex = Math.max(0, products.length - itemsPerView);
        if (prev >= maxIndex) {
          return 0; // Retour au début (infini)
        }
        return prev + 1;
      });
    }, 5000); // 15 secondes

    return () => clearInterval(interval);
  }, [isPaused, products.length, itemsPerView]);

  const maxIndex = Math.max(0, products.length - itemsPerView);
  const canGoPrevious = true; // Toujours possible avec l'effet infini
  const canGoNext = true; // Toujours possible avec l'effet infini

  // Calcul du gap selon la taille d'écran
  const gap = itemsPerView >= 3 ? 24 : itemsPerView === 2 ? 24 : 16;

  // Calcul du transform selon le nombre d'éléments par vue
  const getTransform = () => {
    if (itemsPerView === 1) {
      // Pour 1 élément sur mobile, pas de gap
      return `translateX(-${currentIndex * 100}%)`;
    }
    // Pour 2 ou 3 éléments, on utilise le calcul avec gap
    // On ajoute le padding du wrapper (12px de chaque côté) dans le calcul
    const wrapperPadding = 12;
    return `translateX(calc(-${currentIndex * (100 / itemsPerView)}% - ${currentIndex * gap}px + ${wrapperPadding}px))`;
  };

  return (
    <div className={styles.carouselContainer}>
      {products.length > itemsPerView && (
        <div className={styles.mobileNavButtons}>
          <button
            className={`${styles.navButton} ${styles.navButtonPrev}`}
            onClick={goToPrevious}
            disabled={!canGoPrevious}
            aria-label="Produit précédent"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className={`${styles.navButton} ${styles.navButtonNext}`}
            onClick={goToNext}
            disabled={!canGoNext}
            aria-label="Produit suivant"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}
      <div className={styles.carouselWithControls}>
        {products.length > itemsPerView && (
          <button
            className={`${styles.navButton} ${styles.navButtonPrev} ${styles.desktopNavButton}`}
            onClick={goToPrevious}
            disabled={!canGoPrevious}
            aria-label="Produit précédent"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}

        <div className={styles.carouselWrapper}>
          <div 
            className={styles.carousel}
            style={{
              transform: getTransform(),
            }}
          >
            {products.map((product) => (
              <div key={product.id} className={styles.carouselItem}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </div>

        {products.length > itemsPerView && (
          <button
            className={`${styles.navButton} ${styles.navButtonNext} ${styles.desktopNavButton}`}
            onClick={goToNext}
            disabled={!canGoNext}
            aria-label="Produit suivant"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>

      <div className={styles.carouselFooter}>
        <Link href="/boutique" className={styles.viewAllLink}>
          {t('viewAll')} →
        </Link>
        {products.length > itemsPerView && (
          <div className={styles.dots}>
            {Array.from({ length: maxIndex + 1 }).map((_, index) => (
              <button
                key={index}
                className={`${styles.dot} ${index === currentIndex ? styles.dotActive : ''}`}
                onClick={() => setCurrentIndex(index)}
                aria-label={`Aller au slide ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
