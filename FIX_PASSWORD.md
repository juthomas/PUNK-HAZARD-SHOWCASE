# 🔧 Fix pour le mot de passe avec caractères spéciaux

Votre mot de passe contient des caractères spéciaux (`@` et `#`) qui peuvent poser problème dans `.env.local`.

## ⚠️ Problème

Le caractère `#` est utilisé pour les commentaires dans les fichiers `.env`. Si votre mot de passe contient `#`, tout ce qui suit peut être ignoré comme commentaire.

**Votre mot de passe actuel :** `Q@#5060639127139`

## ✅ Solution

Mettez le mot de passe entre **guillemets doubles** dans votre `.env.local` :

```env
ADMIN_PASSWORD="Q@#5060639127139"
```

Ou avec des guillemets simples :

```env
ADMIN_PASSWORD='Q@#5060639127139'
```

## 📝 Fichier `.env.local` corrigé

```env
# NextAuth.js Configuration
NEXTAUTH_SECRET=votre-secret
NEXTAUTH_URL=http://localhost:3000

# Admin Credentials
ADMIN_EMAIL=admin@punkhazard.org
ADMIN_PASSWORD="Q@#5060639127139"
```

## 🔄 Après modification

1. **Sauvegardez** le fichier `.env.local`
2. **Redémarrez** le serveur de développement :
   ```bash
   # Arrêtez le serveur (Ctrl+C)
   pnpm run dev
   ```
3. **Réessayez** de vous connecter

## 🧪 Vérification

Le code d'authentification affichera maintenant dans les logs du serveur :
- La valeur brute lue depuis `.env.local`
- La valeur nettoyée (sans guillemets)
- La longueur du mot de passe

Cela vous permettra de vérifier que le mot de passe est correctement lu.
