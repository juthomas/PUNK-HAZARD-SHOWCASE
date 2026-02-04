# Gestion des produits

Ce dossier contient les données des produits de la boutique.

## Fichier `products.json`

Le fichier `products.json` contient la liste de tous les produits disponibles dans la boutique.

### Structure d'un produit

```json
{
  "id": 1,
  "name": {
    "fr": "Nom du produit en français",
    "en": "Product name in English"
  },
  "description": {
    "fr": "Description du produit en français",
    "en": "Product description in English"
  },
  "image": "/products/nom-image.jpg",
  "price": "coming",
  "tags": ["Tag 1", "Tag 2", "Tag 3"]
}
```

### Champs

- **id** (number) : Identifiant unique du produit
- **name** (object) : Nom du produit en français et anglais
- **description** (object) : Description du produit en français et anglais
- **image** (string) : Chemin vers l'image (dans `/public/products/`)
- **price** (string) : 
  - `"coming"` pour "À venir"
  - `"quote"` pour "Sur devis"
  - Ou un prix direct comme `"150€"` ou `"$199"`
- **tags** (array) : Liste de tags/catégories pour le produit

### Ajouter un produit

1. Ouvrez `products.json`
2. Ajoutez un nouvel objet dans le tableau
3. Donnez-lui un `id` unique (incrémentez le dernier ID)
4. Ajoutez les traductions pour `name` et `description`
5. Ajoutez l'image dans `/public/products/` et mettez le chemin dans `image`
6. Définissez le `price` (coming, quote, ou prix direct)
7. Ajoutez des `tags` pertinents

### Exemple

```json
{
  "id": 5,
  "name": {
    "fr": "Nouveau produit",
    "en": "New product"
  },
  "description": {
    "fr": "Description détaillée du nouveau produit",
    "en": "Detailed description of the new product"
  },
  "image": "/products/nouveau-produit.jpg",
  "price": "299€",
  "tags": ["Audio", "Nouveau", "Premium"]
}
```

### Images

- Placez vos images dans `/public/products/`
- Formats recommandés : JPG, PNG, WebP
- Taille recommandée : 800x800px minimum (carré)
- Nommez les fichiers de manière descriptive (ex: `as-simt-sensor.jpg`)

### Prix

- **"coming"** : Affiche "À venir" / "Coming soon"
- **"quote"** : Affiche "Sur devis" / "On quote"
- **Prix direct** : Affiche le prix tel quel (ex: "150€", "$199", "299€ HT")
