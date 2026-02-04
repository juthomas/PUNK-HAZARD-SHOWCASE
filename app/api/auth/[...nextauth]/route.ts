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

        const email = credentials.email as string;
        const password = credentials.password as string;

        // TODO: Remplacer par une vraie vérification en base de données
        // Pour l'instant, on vérifie contre les variables d'environnement
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (
          email === adminEmail &&
          password === adminPassword
        ) {
          return {
            id: '1',
            email: email,
            name: 'Admin',
          };
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
