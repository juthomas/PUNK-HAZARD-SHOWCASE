import { useTranslations } from 'next-intl';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import ProductCard, { Product } from '@/app/components/ProductCard';
import productsData from '@/data/products.json';
import styles from './page.module.css';

export default function BoutiquePage() {
  const t = useTranslations('shop');

  // Convert JSON data to Product type
  const products: Product[] = productsData.map((product) => ({
    ...product,
    name: product.name as { fr: string; en: string },
    description: product.description as { fr: string; en: string },
  }));

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>{t('title')}</h1>
            <p className={styles.subtitle}>{t('subtitle')}</p>
          </div>

          <div className={styles.productGrid}>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
