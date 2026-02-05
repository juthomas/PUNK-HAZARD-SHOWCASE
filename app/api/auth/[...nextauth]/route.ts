import NextAuth, { type DefaultSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';

// Pour un vrai e-commerce, vous devriez utiliser une vraie base de données
// Ici, on utilise une solution simple avec variables d'environnement pour les admins
// Vous pouvez facilement migrer vers Supabase, MongoDB, PostgreSQL, etc.

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

const handler = NextAuth({
  providers: [
    // Provider Email/Password (simple, pour démarrer)
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Trim pour éviter les espaces
        const email = (credentials.email as string).trim();
        const password = (credentials.password as string).trim();

        // TODO: Remplacer par une vraie vérification en base de données
        // Pour l'instant, on vérifie contre les variables d'environnement
        let adminEmail = process.env.ADMIN_EMAIL;
        let adminPassword = process.env.ADMIN_PASSWORD;

        // Vérifier que les variables d'environnement sont définies
        if (!adminEmail || !adminPassword) {
          console.error('ADMIN_EMAIL ou ADMIN_PASSWORD non définis dans les variables d\'environnement');
          if (process.env.NODE_ENV === 'development') {
            console.error('ADMIN_EMAIL défini:', !!process.env.ADMIN_EMAIL);
            console.error('ADMIN_PASSWORD défini:', !!process.env.ADMIN_PASSWORD);
          }
          return null;
        }

        // Nettoyer les valeurs : supprimer les guillemets et espaces
        adminEmail = adminEmail.trim().replace(/^["']|["']$/g, '');
        adminPassword = adminPassword.trim().replace(/^["']|["']$/g, '');
        
        // Log en développement pour voir les valeurs brutes
        if (process.env.NODE_ENV === 'development') {
          console.log('🔐 Debug auth - Variables d\'environnement:', {
            adminEmailRaw: process.env.ADMIN_EMAIL,
            adminPasswordRaw: process.env.ADMIN_PASSWORD ? `${process.env.ADMIN_PASSWORD.substring(0, 3)}...` : 'undefined',
            adminEmailCleaned: adminEmail,
            adminPasswordCleaned: `${adminPassword.substring(0, 3)}...`,
            adminPasswordLength: adminPassword.length,
          });
        }

        // Comparaison stricte (sensible à la casse pour l'email, mais pas pour le mot de passe par défaut)
        // Note: En production, vous devriez utiliser bcrypt pour comparer les mots de passe
        const emailMatch = email.toLowerCase() === adminEmail.toLowerCase();
        const passwordMatch = password === adminPassword;

        if (emailMatch && passwordMatch) {
          return {
            id: '1',
            email: adminEmail, // Utiliser l'email de l'env pour éviter les problèmes de casse
            name: 'Admin',
          };
        }

        // Log en développement pour déboguer (ne pas faire ça en production)
        if (process.env.NODE_ENV === 'development') {
          console.log('Tentative de connexion échouée:', {
            emailProvided: email,
            emailExpected: adminEmail,
            emailMatch,
            passwordMatch: passwordMatch ? '✓' : '✗',
            passwordProvidedLength: password.length,
            passwordExpectedLength: adminPassword.length,
            passwordProvidedHasSpaces: password.includes(' '),
            passwordExpectedHasSpaces: adminPassword.includes(' '),
            passwordProvidedFirstChar: password.charAt(0),
            passwordExpectedFirstChar: adminPassword.charAt(0),
            passwordProvidedLastChar: password.charAt(password.length - 1),
            passwordExpectedLastChar: adminPassword.charAt(adminPassword.length - 1),
          });
        }

        // Ici, vous pouvez ajouter une vérification en base de données
        // Exemple avec Supabase:
        // const { data, error } = await supabase
        //   .from('users')
        //   .select('*')
        //   .eq('email', credentials.email)
        //   .single();
        //
        // if (error || !data) return null;
        // if (!await bcrypt.compare(credentials.password, data.password)) return null;
        // return { id: data.id, email: data.email, name: data.name };

        return null;
      },
    }),
    
    // Provider Google OAuth (optionnel)
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  
  pages: {
    signIn: '/login',
    error: '/login',
  },
  
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  
  session: {
    strategy: 'jwt',
  },
  
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
