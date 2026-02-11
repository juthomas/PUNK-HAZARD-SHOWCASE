'use client';

import { useState, FormEvent, useEffect, useRef, ChangeEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import styles from './page.module.css';

export default function ContactPage() {
  const t = useTranslations('contact');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [antiBotSlider, setAntiBotSlider] = useState(0);
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const formStartedAtRef = useRef<number>(Date.now());
  const isHumanVerified = antiBotSlider >= 100;

  // Préremplir le sujet si présent dans l'URL
  useEffect(() => {
    const subjectParam = searchParams.get('subject');
    if (subjectParam) {
      // Traduire "devis" selon la langue
      const translatedSubject = subjectParam === 'devis' 
        ? t('form.defaultSubject')
        : subjectParam;
      setFormData(prev => ({
        ...prev,
        subject: translatedSubject,
      }));
    }
  }, [searchParams, t]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!isHumanVerified) {
      setStatus('error');
      setErrorMessage(t('form.humanCheckError'));
      return;
    }

    if (honeypot.trim().length > 0) {
      setStatus('error');
      setErrorMessage(t('form.error'));
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          locale,
          antiBot: {
            sliderValue: antiBotSlider,
            honeypot,
            elapsedMs: Date.now() - formStartedAtRef.current,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('form.error'));
      }

      setStatus('success');
      setFormData({ name: '', email: '', subject: '', message: '' });
      setAntiBotSlider(0);
      setHoneypot('');
      formStartedAtRef.current = Date.now();
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : t('form.error'));
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleAntiBotSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAntiBotSlider(Number(e.target.value));
  };

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>{t('title')}</h1>
            <p className={styles.subtitle}>
              {t('subtitle')}
            </p>
          </div>

          <div className={styles.content}>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label htmlFor="name" className={styles.label}>
                  {t('form.name')} {t('form.required')}
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className={styles.input}
                  placeholder={t('form.namePlaceholder')}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="email" className={styles.label}>
                  {t('form.email')} {t('form.required')}
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className={styles.input}
                  placeholder={t('form.emailPlaceholder')}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="subject" className={styles.label}>
                  {t('form.subject')}
                </label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  className={styles.input}
                  placeholder={t('form.subjectPlaceholder')}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="message" className={styles.label}>
                  {t('form.message')} {t('form.required')}
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={8}
                  className={styles.textarea}
                  placeholder={t('form.messagePlaceholder')}
                />
              </div>

              <div className={styles.honeypotWrapper} aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  type="text"
                  id="website"
                  name="website"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              <div className={`${styles.formGroup} ${styles.humanCheckGroup}`}>
                <label htmlFor="antiBotSlider" className={styles.label}>
                  {t('form.humanCheckLabel')} {t('form.required')}
                </label>
                <p className={styles.humanCheckHint}>{t('form.humanCheckHint')}</p>
                <input
                  type="range"
                  id="antiBotSlider"
                  name="antiBotSlider"
                  min={0}
                  max={100}
                  value={antiBotSlider}
                  onChange={handleAntiBotSliderChange}
                  className={styles.slider}
                  aria-describedby="antiBotStatus"
                />
                <p
                  id="antiBotStatus"
                  className={`${styles.humanCheckStatus} ${
                    isHumanVerified ? styles.humanCheckStatusReady : ''
                  }`}
                >
                  {isHumanVerified
                    ? t('form.humanCheckReady')
                    : t('form.humanCheckProgress', { value: antiBotSlider })}
                </p>
              </div>

              {status === 'error' && (
                <div className={styles.error}>
                  {errorMessage || t('form.error')}
                </div>
              )}

              {status === 'success' && (
                <div className={styles.success}>
                  {t('form.success')}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading' || !isHumanVerified}
                className={styles.submitButton}
              >
                {status === 'loading'
                  ? t('form.sending')
                  : isHumanVerified
                    ? t('form.submit')
                    : t('form.submitLocked')}
              </button>
            </form>

            <div className={styles.info}>
              <h2 className={styles.infoTitle}>{t('other.title')}</h2>
              <div className={styles.infoItem}>
                <strong>{t('other.email')}</strong>
                <a href="mailto:contact@punkhazard.org">contact@punkhazard.org</a>
              </div>
              <div className={styles.infoItem}>
                <strong>{t('other.response')}</strong>
                <span>{t('other.responseTime')}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
