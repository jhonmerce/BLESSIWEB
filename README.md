# Blessing Petroleum — gestion de station-service

Application de gestion des achats, ventes, stocks, dépenses et rapports, avec une interface française adaptée au mobile.

## Démarrage local

Prérequis : Node.js 20+, npm et un projet Supabase avec une base PostgreSQL.

1. Dans le tableau de bord Supabase, ouvre **Connect**. Utilise l’URL IPv4 / **Transaction pooler** (souvent port `6543`) comme `DATABASE_URL`. Utilise l’URL **Direct connection** si IPv4 est activé, sinon l’URL **Session pooler** (port `5432`) comme `DIRECT_URL` pour Prisma Migrate.
2. Depuis la racine du projet, crée `server/.env` avec `Copy-Item .env.example server/.env`. Remplace les valeurs entre crochets des deux URL, puis définis un `JWT_SECRET` long et change `ADMIN_PASSWORD`.
3. Installe les dépendances : `npm install`.
4. Applique la migration versionnée à Supabase avec `npm run db:migrate`.
5. Crée l’administrateur et les données initiales : `npm run db:seed`.
6. Lance l’application : `npm run dev` (interface sur http://localhost:5173, API sur http://localhost:3000).

L’identifiant initial vient de `ADMIN_EMAIL` et `ADMIN_PASSWORD` dans `server/.env`. Le mot de passe est haché avec bcrypt. En production, servez l’application sous HTTPS, définissez un secret JWT propre et restreignez `CLIENT_ORIGIN`. Ne publiez jamais `server/.env` ni l’URL de connexion.

## Déploiement avec Docker

Le dépôt fournit des images séparées pour l'API et l'interface web. Nginx sert le client et transmet `/api` à l'API. Le conteneur `migrate` applique les migrations avant le démarrage de l'API. Le port public par défaut est `8080`.

1. Copiez `.env.example` vers `.env` et renseignez `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` et `ADMIN_PASSWORD`. Pour Supabase, utilisez le pooler transactionnel pour `DATABASE_URL` et une connexion directe ou pooler de session pour `DIRECT_URL`.
2. Réglez `CLIENT_ORIGIN_DOCKER` sur l'origine utilisée dans le navigateur (`http://localhost:8080` en local, ou votre domaine HTTPS en production). Réglez `WEB_PORT` si le port `8080` est déjà utilisé.
3. Construisez et démarrez les conteneurs : `docker compose up --build -d`.
4. Créez le compte administrateur et les données initiales une seule fois : `docker compose run --rm migrate npm run db:seed -w server`.

Ouvrez ensuite `http://localhost:8080`. En production, placez un reverse proxy HTTPS devant le port web. Le fichier `.dockerignore` exclut les fichiers `.env` des images; les secrets sont transmis aux conteneurs par Docker Compose et ne sont pas intégrés aux images.

Pour lancer aussi une base PostgreSQL locale au lieu de Supabase, définissez `POSTGRES_PASSWORD` avec un mot de passe sûr dans `.env`, puis utilisez `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d`. Ce fichier compose complémentaire redirige l'API et les migrations vers le conteneur PostgreSQL local.

`DIRECT_URL` désigne ici la connexion Prisma réservée aux migrations. En développement local, utilisez `npm run db:migrate:dev -w server -- --name nom_de_migration`; pour Supabase, appliquez les migrations déjà créées avec `npm run db:migrate`.

## Fonctionnalités

- Achat et vente dans une transaction PostgreSQL avec journal des mouvements et mise à jour atomique du stock. Une vente supérieure au stock est rejetée.
- Dépenses et catégories modifiables, prix de vente par défaut, authentification JWT, changement de mot de passe.
- Dashboard, indicateurs de stock, graphiques, filtres, pagination et export Excel. Rapports imprimables en PDF.
- Prix et quantités positifs validés côté API; dates enregistrées en ISO et affichées en français.

## Import SQLite historique

L’importeur inspecte les tables SQLite et accepte les noms de colonnes courants en français et en anglais (carburants, achats, ventes, catégories, dépenses). Placez le fichier dans la racine sous `carburant.db`, puis lancez `npm run import:sqlite -w server -- ..\carburant.db`. Les lignes dont les quantités ou montants sont invalides sont ignorées. Faites une sauvegarde PostgreSQL avant un import de production.

## API REST

Toutes les routes sauf `POST /api/auth/login` demandent `Authorization: Bearer <JWT>`.

| Route                                         | Méthodes                                     |
| --------------------------------------------- | -------------------------------------------- |
| `/api/auth`                                   | `POST /login`, `GET /me`, `PATCH /password`  |
| `/api/carburants`                             | `GET`, `POST`, `PATCH /:id`                  |
| `/api/achats`, `/api/ventes`, `/api/depenses` | `GET`, `POST`, `DELETE /:id`                 |
| `/api/categories-depenses`                    | `GET`, `POST`, `DELETE /:id`                 |
| `/api/stocks`, `/api/mouvements-stock`        | `GET`                                        |
| `/api/dashboard`, `/api/rapports`             | `GET` (rapports accepte `de` et `a`)         |
| `/api/exports/:type`                          | `GET` — achats, ventes, dépenses, mouvements |
| `/api/import/sqlite`                          | réservé — voir import historique             |

## Structure

- `client/` — React, TypeScript, Vite, Tailwind, Recharts, XLSX, jsPDF.
- `server/` — Express, validation Zod, bcrypt, JWT, Prisma et PostgreSQL.
- `server/prisma/migrations/` — migrations générées avec Prisma Migrate à partir du schéma.

## Vérification

`npm test` lance les tests unitaires des calculs financiers et seuils de stock. `npm run build` compile l’API et le client. `npm run format` applique le formatage Prettier à l’ensemble du code; `npm run format:check` le vérifie sans modifier les fichiers.

## Session et jetons

L'API remet un access token JWT de courte durée (15 minutes par défaut). Le frontend le conserve uniquement en mémoire et le renouvelle automatiquement à l'aide d'un refresh token rotatif. Le refresh token brut est placé dans le cookie `station_refresh` avec les attributs `HttpOnly`, `SameSite=Lax` et `Secure` en production. Il n'est donc pas accessible au JavaScript du navigateur.

PostgreSQL ne conserve que l'empreinte SHA-256 du refresh token dans la table `RefreshToken`, avec ses dates d'expiration et de révocation. La déconnexion et le changement de mot de passe révoquent le jeton. Les migrations `20261014100000_refresh_tokens` et `20261014120000_idempotent_financial_operations` doivent être appliquées avant de relancer l'API.

Après cette mise à jour, arrêtez l'API si elle tourne, puis lancez `npx prisma generate --schema=server/prisma/schema.prisma`, `npm run db:migrate` et `npm run build`. Le port `PORT` est celui de l'API (3000 par défaut), distinct des ports PostgreSQL (6543/5432).
