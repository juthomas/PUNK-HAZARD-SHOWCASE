'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import LoginModal from '@/app/components/LoginModal';
import { useTranslations } from 'next-intl';

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('auth');
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const error = searchParams.get('error');
    const callbackUrl = searchParams.get('callbackUrl');
    
    // Si pas d'erreur et callbackUrl, rediriger directement
    if (!error && callbackUrl) {
      try {
        // Décoder l'URL et extraire le chemin
        const decodedUrl = decodeURIComponent(callbackUrl);
        // Si c'est une URL complète, extraire le chemin
        const url = new URL(decodedUrl);
        router.push(url.pathname + url.search);
      } catch {
        // Si ce n'est pas une URL complète, utiliser directement
        const decodedUrl = decodeURIComponent(callbackUrl);
        router.push(decodedUrl);
      }
    }
  }, [mounted, searchParams, router]);

  const handleClose = () => {
    setIsModalOpen(false);
    // Rediriger vers la page d'accueil
    router.push('/');
  };

  if (!mounted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Chargement...</p>
        </main>
        <Footer />
      </div>
    );
  }

  const error = searchParams.get('error');
  const callbackUrl = searchParams.get('callbackUrl');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <h1 style={{ marginBottom: '20px', fontSize: '24px', fontWeight: 600 }}>
            {error === 'Callback' ? t('error') : t('login')}
          </h1>
          {error === 'Callback' && (
            <p style={{ marginBottom: '20px', opacity: 0.8 }}>
              {locale === 'fr' 
                ? 'Une erreur s\'est produite lors de la connexion avec Google. Veuillez réessayer.'
                : 'An error occurred while signing in with Google. Please try again.'
              }
            </p>
          )}
          <p style={{ opacity: 0.6, fontSize: '14px' }}>
            {locale === 'fr'
              ? 'La fenêtre de connexion devrait s\'ouvrir automatiquement...'
              : 'The login window should open automatically...'
            }
          </p>
        </div>
      </main>
      <Footer />
      <LoginModal isOpen={isModalOpen} onClose={handleClose} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Chargement...</p>
        </main>
        <Footer />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
