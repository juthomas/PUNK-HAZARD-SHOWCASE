# Configuration

## Variables d'environnement

Créez un fichier `.env.local` à la racine du projet avec les variables suivantes :

```env
# Resend API Configuration
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=contact@punkhazard.fr
RESEND_TO_EMAIL=contact@punkhazard.org

# Contact Email (fallback)
NEXT_PUBLIC_CONTACT_EMAIL=contact@punkhazard.org
```

## Configuration Resend

1. Créez un compte sur [Resend](https://resend.com)
2. Générez une clé API
3. Ajoutez la clé dans `RESEND_API_KEY`
4. Configurez votre domaine d'envoi dans Resend
5. Mettez à jour `RESEND_FROM_EMAIL` avec votre email vérifié

## Internationalisation (i18n)

Le site supporte le français (fr) et l'anglais (en) via `next-intl`.

### Structure des traductions

Les fichiers de traduction se trouvent dans `/messages/` :
- `fr.json` - Traductions françaises
- `en.json` - Traductions anglaises

### URLs

Les pages sont accessibles avec le préfixe de langue :
- `/fr/` - Version française (par défaut)
- `/en/` - Version anglaise
- `/` - Redirige automatiquement vers `/fr/`

### Ajouter une traduction

1. Ajoutez la clé dans `messages/fr.json`
2. Ajoutez la même clé dans `messages/en.json`
3. Utilisez `useTranslations('namespace')` dans vos composants

### Exemple

```tsx
import { useTranslations } from 'next-intl';

export default function MyComponent() {
  const t = useTranslations('home');
  return <h1>{t('title')}</h1>;
}
```

## Pages disponibles

- `/fr/` ou `/en/` - Page d'accueil
- `/fr/boutique` ou `/en/shop` - Catalogue produits
- `/fr/services` ou `/en/services` - Services proposés
- `/fr/projets` ou `/en/projects` - Projets et réalisations
- `/fr/contact` ou `/en/contact` - Formulaire de contact
- `/fr/a-propos` ou `/en/about` - À propos
- `/fr/cgv` ou `/en/terms` - Conditions générales de vente
- `/fr/mentions-legales` ou `/en/legal` - Mentions légales
