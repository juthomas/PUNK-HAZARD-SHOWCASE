import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type User = {
  id: string;
  email: string;
  name: string;
  password: string; // En production, utiliser bcrypt pour hasher
  createdAt: string;
};

type UsersStore = {
  users: User[];
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => User | null;
  getUserByEmail: (email: string) => User | undefined;
  getUserById: (id: string) => User | undefined;
  verifyPassword: (email: string, password: string) => User | null;
};

// Générer un ID unique
const generateId = (): string => {
  return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const useUsersStore = create<UsersStore>()(
  persist(
    (set, get) => ({
      users: [],
      
      addUser: (userData) => {
        // Vérifier si l'email existe déjà
        const existingUser = get().getUserByEmail(userData.email.toLowerCase());
        if (existingUser) {
          return null; // Email déjà utilisé
        }
        
        const newUser: User = {
          ...userData,
          id: generateId(),
          email: userData.email.toLowerCase().trim(), // Normaliser l'email
          createdAt: new Date().toISOString(),
        };
        
        set({
          users: [...get().users, newUser],
        });
        
        return newUser;
      },
      
      getUserByEmail: (email) => {
        return get().users.find(
          user => user.email.toLowerCase() === email.toLowerCase().trim()
        );
      },
      
      getUserById: (id) => {
        return get().users.find(user => user.id === id);
      },
      
      verifyPassword: (email, password) => {
        const user = get().getUserByEmail(email);
        if (!user) {
          return null;
        }
        
        // Comparaison simple (en production, utiliser bcrypt.compare)
        if (user.password === password.trim()) {
          return user;
        }
        
        return null;
      },
    }),
    {
      name: 'users-storage',
    }
  )
);
