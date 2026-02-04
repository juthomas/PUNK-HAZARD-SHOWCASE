import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  const messages = locale === 'fr' ? frMessages : enMessages;

  return {
    locale,
    messages
  };
});
