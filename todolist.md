# Todolist — Actions manuelles (ce que je ne peux pas faire à ta place)

Tout ce qui est implémentable en code pour le SEO technique a été appliqué.  
Il reste ces actions dépendantes de ton accès, de ton contenu, ou de validations externes.

## 1) Déploiement et configuration

- [ ] Définir les variables d’environnement **en production** (`NEXT_PUBLIC_SITE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `RESEND_*`, `ADMIN_*`, etc. depuis `env.example`).
- [ ] Ajouter `GOOGLE_SITE_VERIFICATION` (token Search Console) dans l’environnement de prod.
- [ ] Configurer le domaine final et vérifier SSL.
- [ ] Vérifier en ligne `https://votredomaine.com/robots.txt` et `https://votredomaine.com/sitemap.xml`.

## 2) Google / indexation

- [ ] Ajouter le site dans Google Search Console.
- [ ] Soumettre le sitemap (`/sitemap.xml`).
- [ ] Vérifier que seules les pages publiques sont indexées (login/profil/shutdown doivent rester non indexées).

## 3) Branding & contenu

- [ ] Remplacer les placeholders produits dans `public/products/` par des visuels finaux optimisés.
- [ ] Optionnel: remplacer les templates `opengraph-image` / `twitter-image` par des visuels de marque finaux.
- [ ] Relire et valider les textes FR/EN (accroches, services, projets, mentions légales, CGV).

## 4) Légal et conformité

- [ ] Compléter les informations légales exactes (adresse, statut, TVA, etc.) dans les pages légales.
- [ ] Ajouter/valider la politique de confidentialité et le bandeau cookies si analytics ou cookies non techniques.
- [ ] Faire relire CGV/mentions légales par un professionnel si nécessaire.

## 5) Validation fonctionnelle réelle

- [ ] Tester les parcours en prod: formulaire contact, auth, redirections, pages FR/EN.
- [ ] Tester mobile/tablette + principaux navigateurs.
- [ ] Contrôler les Core Web Vitals sur le domaine réel (Lighthouse / Search Console / Vercel Analytics).

*Dernière mise à jour : février 2026*
