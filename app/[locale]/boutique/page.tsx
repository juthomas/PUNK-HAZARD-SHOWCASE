import { useTranslations } from 'next-intl';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import styles from './page.module.css';

export default function BoutiquePage() {
  const t = useTranslations('shop');
  const tHome = useTranslations('home.sections.shop');

  const products = [
    {
      id: 1,
      name: tHome('products.as-simt.name'),
      description: tHome('products.as-simt.description'),
      price: tHome('price.coming'),
      tags: ['Capteurs haptiques', 'PCB custom', 'ESP32', 'OSC'],
    },
    {
      id: 2,
      name: tHome('products.audio.name'),
      description: tHome('products.audio.description'),
      price: tHome('price.coming'),
      tags: ['Audio', 'I2S', 'Multi-canal'],
    },
    {
      id: 3,
      name: tHome('products.pcb.name'),
      description: tHome('products.pcb.description'),
      price: tHome('price.quote'),
      tags: ['PCB', 'KiCad', 'DFM'],
    },
    {
      id: 4,
      name: 'Base XXL',
      description: 'Plateforme scénographique avec 3 enceintes, écran tactile, transducteurs et dock de recharge pour capteurs.',
      price: tHome('price.quote'),
      tags: ['Installation', 'Audio', 'Scénographie'],
    },
  ];

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
              <div key={product.id} className={styles.productCard}>
                <div className={styles.productImagePlaceholder}>
                  <span>Image produit</span>
                </div>
                <div className={styles.productContent}>
                  <h3 className={styles.productName}>{product.name}</h3>
                  <p className={styles.productDescription}>{product.description}</p>
                  <div className={styles.productTags}>
                    {product.tags.map((tag, index) => (
                      <span key={index} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className={styles.productPrice}>{product.price}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
