import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

// API route pour vérifier les credentials d'un utilisateur
// Utilisée par NextAuth pour authentifier les utilisateurs

type User = {
  id: string;
  email: string;
  name: string;
  password: string;
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email et mot de passe requis' },
        { status: 400 }
      );
    }

    const users = getUsers();
    const user = users.find(
      u => u.email.toLowerCase() === email.toLowerCase().trim()
    );

    if (!user) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 404 }
      );
    }

    // Comparaison simple (en production, utiliser bcrypt.compare)
    if (user.password.trim() === password.trim()) {
      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      });
    }

    return NextResponse.json(
      { error: 'Mot de passe incorrect' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Erreur lors de la vérification:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
