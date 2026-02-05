# Guide de débogage - Authentification Admin

Si votre compte admin ne fonctionne pas, suivez ces étapes pour identifier et résoudre le problème.

## 🔍 Vérifications de base

### 1. Vérifier que `.env.local` existe et contient les bonnes variables

```bash
# Vérifier que le fichier existe
ls -la .env.local

# Voir le contenu (sans afficher les valeurs sensibles)
grep -E "^ADMIN_|^NEXTAUTH_" .env.local
```

### 2. Vérifier le format du fichier `.env.local`

Le fichier doit respecter ce format (sans espaces autour du `=`):

```env
ADMIN_EMAIL=admin@punkhazard.org
ADMIN_PASSWORD=votre-mot-de-passe
NEXTAUTH_SECRET=votre-secret-genere
NEXTAUTH_URL=http://localhost:3000
```

**❌ MAUVAIS (avec espaces):**
```env
ADMIN_EMAIL = admin@punkhazard.org
ADMIN_PASSWORD = votre-mot-de-passe
```

**✅ BON (sans espaces):**
```env
ADMIN_EMAIL=admin@punkhazard.org
ADMIN_PASSWORD=votre-mot-de-passe
```

### 3. Vérifier les valeurs

- **ADMIN_EMAIL**: Doit être un email valide (avec `@`)
- **ADMIN_PASSWORD**: Ne doit pas contenir d'espaces au début ou à la fin
- **NEXTAUTH_SECRET**: Doit être généré avec `openssl rand -base64 32`

## 🐛 Problèmes courants

### Problème 1: Variables non chargées

**Symptôme**: La connexion échoue même avec les bons identifiants.

**Solution**:
1. Vérifiez que le fichier s'appelle bien `.env.local` (pas `.env` ou `.env.local.example`)
2. Redémarrez le serveur de développement après avoir modifié `.env.local`
3. Vérifiez qu'il n'y a pas de guillemets autour des valeurs dans `.env.local`

### Problème 2: Espaces dans les valeurs

**Symptôme**: La connexion échoue même avec les bons identifiants.

**Solution**:
- Supprimez tous les espaces avant et après les valeurs
- Utilisez `trim()` dans votre éditeur pour nettoyer les lignes

### Problème 3: Casse de l'email

**Symptôme**: La connexion échoue selon la casse utilisée.

**Solution**:
- Le code compare maintenant l'email en insensible à la casse
- Utilisez l'email exact tel qu'il est dans `.env.local` pour être sûr

### Problème 4: Cache Next.js

**Symptôme**: Les modifications de `.env.local` ne sont pas prises en compte.

**Solution**:
```bash
# Supprimer le cache
rm -rf .next

# Redémarrer le serveur
pnpm run dev
```

## 🔧 Débogage avec les logs

Le code d'authentification affiche maintenant des logs en mode développement. Regardez la console du serveur (pas le navigateur) pour voir:

```
Tentative de connexion échouée: {
  emailProvided: 'votre-email',
  emailExpected: 'email-dans-env',
  emailMatch: true/false,
  passwordMatch: '✓' ou '✗'
}
```

## ✅ Checklist de vérification

- [ ] Le fichier `.env.local` existe à la racine du projet
- [ ] `ADMIN_EMAIL` est défini et contient un email valide
- [ ] `ADMIN_PASSWORD` est défini et ne contient pas d'espaces
- [ ] `NEXTAUTH_SECRET` est défini et fait au moins 32 caractères
- [ ] `NEXTAUTH_URL` est défini (http://localhost:3000 pour le dev)
- [ ] Aucun espace autour du `=` dans `.env.local`
- [ ] Le serveur a été redémarré après modification de `.env.local`
- [ ] Le cache `.next` a été supprimé si nécessaire

## 🧪 Test rapide

1. Ouvrez la modale de connexion
2. Entrez l'email exact de `ADMIN_EMAIL`
3. Entrez le mot de passe exact de `ADMIN_PASSWORD`
4. Vérifiez les logs du serveur pour voir ce qui se passe

## 📝 Exemple de `.env.local` correct

```env
# NextAuth.js Configuration
NEXTAUTH_SECRET=aBc123XyZ456DeF789GhI012JkL345MnO678PqR901StU234VwX567YzA890=
NEXTAUTH_URL=http://localhost:3000

# Admin Credentials
ADMIN_EMAIL=admin@punkhazard.org
ADMIN_PASSWORD=MonMotDePasseSecurise123!
```

## 🆘 Si rien ne fonctionne

1. Vérifiez que vous utilisez bien l'email et le mot de passe de `.env.local`
2. Vérifiez les logs du serveur pour les erreurs
3. Vérifiez que `NEXTAUTH_SECRET` est bien défini (sans ça, NextAuth ne fonctionne pas)
4. Essayez de générer un nouveau `NEXTAUTH_SECRET`:
   ```bash
   openssl rand -base64 32
   ```
