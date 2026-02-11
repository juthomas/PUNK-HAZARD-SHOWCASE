# Todolist — Finaliser le site PUNK HAZARD

Actions à faire pour finaliser le site avant mise en production.

---

## 1. Configuration & déploiement

- [ ] **Variables d’environnement en production**  
  Définir sur l’hébergeur (Vercel, etc.) :
  - `NEXT_PUBLIC_SITE_URL` = `https://punkhazard.org` (ou l’URL réelle du site)
  - `NEXTAUTH_URL` = URL de production
  - `NEXTAUTH_SECRET`, `RESEND_*`, `ADMIN_*`, etc. (voir `env.example`)

- [ ] **Domaine**  
  Configurer le domaine (punkhazard.org ou autre) sur l’hébergeur et vérifier SSL.

- [ ] **Vérifier robots.txt & sitemap**  
  Après déploiement : ouvrir `https://votredomaine.com/robots.txt` et `https://votredomaine.com/sitemap.xml` et vérifier que les URLs utilisent bien le bon domaine.

---

## 2. Image Open Graph (réseaux sociaux)

- [ ] **Remplacer le template OG par une vraie image**  
  Actuellement une image est générée automatiquement (template). Pour une image personnalisée :
  - Créer une image **1200 × 630 px** (format recommandé Open Graph).
  - La placer dans `public/` (ex. `public/og-image.png`).
  - Soit remplacer la convention actuelle en ajoutant dans le layout une référence vers `/og-image.png` dans `openGraph.images`, soit supprimer `app/[locale]/opengraph-image.tsx` et utiliser un fichier statique nommé `opengraph-image.png` dans `app/[locale]/` (voir doc Next.js Metadata).

---

## 3. Contenu & textes

- [ ] **Relire les textes**  
  Vérifier les traductions (fr / en) sur toutes les pages : accueil, à propos, services, projets, boutique, contact, CGV, mentions légales.

- [ ] **Images produits**  
  Remplacer les placeholders dans `public/products/` par les vraies photos des produits (tout en gardant des noms/chemins cohérents si besoin).

- [ ] **Favicon**  
  Vérifier que `app/favicon.ico` correspond à la marque (ou ajouter les variantes apple-touch-icon si besoin).

---

## 4. Sécurité & technique

- [ ] **Secrets**  
  Vérifier qu’aucune clé API, mot de passe ou secret n’est commitée dans le repo (tout doit passer par les variables d’environnement).

- [ ] **Comptes admin**  
  Changer les identifiants admin par défaut (email / mot de passe) en production.

- [ ] **Formulaire de contact**  
  Tester l’envoi du formulaire en production (Resend ou autre) et vérifier la réception des emails.

- [ ] **Auth (NextAuth)**  
  Tester connexion / déconnexion et, si utilisé, la connexion Google OAuth en production (URLs de redirection autorisées).

---

## 5. SEO & analytics (optionnel)

- [ ] **Google Search Console**  
  Ajouter le site et soumettre le sitemap (`/sitemap.xml`).

- [ ] **Analytics**  
  Si souhaité : ajouter Google Analytics, Plausible ou autre (script ou tag dans le layout).

---

## 6. Légal & conformité

- [ ] **Mentions légales**  
  Compléter les infusions exactes (adresse, hébergeur, éventuellement numéro TVA) dans les textes et dans les traductions.

- [ ] **Politique de confidentialité / cookies**  
  Si vous utilisez des cookies non strictement techniques ou des analytics : ajouter une page ou un bandeau pour consentement / lien vers la politique.

- [ ] **CGV**  
  Faire valider les CGV par un professionnel si vous vendez ou facturez.

---

## 7. Tests finaux

- [ ] **Navigation**  
  Parcourir tout le site (fr et en) : liens, menu, footer, boutons.

- [ ] **Responsive**  
  Tester sur mobile et tablette (affichage, formulaire contact, boutique).

- [ ] **Performances**  
  Vérifier les Core Web Vitals (Lighthouse ou outil hébergeur) et corriger les points bloquants si besoin.

---

*Dernière mise à jour : février 2025*
