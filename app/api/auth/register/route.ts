import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Note: En production, vous devriez utiliser une vraie base de données
// et hasher les mots de passe avec bcrypt
// Ceci est une solution simple pour démarrer

type User = {
  id: string;
  email: string;
  name: string;
  password: string; // En production, utiliser bcrypt pour hasher
  createdAt: string;
};

const getUsersFilePath = () => {
  return join(process.cwd(), 'data', 'users.json');
};

const getUsers = (): User[] => {
  try {
    const filePath = getUsersFilePath();
    const fileContents = readFileSync(filePath, 'utf8');
    return JSON.parse(fileContents);
  } catch (error) {
    return [];
  }
};

const saveUsers = (users: User[]) => {
  const filePath = getUsersFilePath();
  writeFileSync(filePath, JSON.stringify(users, null, 2), 'utf8');
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // Validation
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Tous les champs sont requis' },
        { status: 400 }
      );
    }

    // Validation email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email invalide' },
        { status: 400 }
      );
    }

    // Validation mot de passe (minimum 8 caractères)
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 8 caractères' },
        { status: 400 }
      );
    }

    // Vérifier si l'email existe déjà
    const users = getUsers();
    const existingUser = users.find(
      u => u.email.toLowerCase() === email.toLowerCase().trim()
    );

    if (existingUser) {
      return NextResponse.json(
        { error: 'Cet email est déjà utilisé' },
        { status: 400 }
      );
    }

    // Créer le nouvel utilisateur
    const newUser: User = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password: password.trim(), // En production, hasher avec bcrypt
      createdAt: new Date().toISOString(),
    };

    // Sauvegarder
    users.push(newUser);
    saveUsers(users);

    return NextResponse.json(
      { 
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
