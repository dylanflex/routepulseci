# RoutePulse CI

RoutePulse est une application de signalement et de carte de trafic collaboratifs pour la Côte d'Ivoire (Abidjan) : signalement d'incidents (embouteillage, accident, inondation, nid de poule, contrôle, travaux) en un clic, fil social pour commenter/confirmer, et surtout un mode **« avant de partir »** qui scanne un itinéraire réel pour dire à l'automobiliste ce qui l'attend avant même de prendre la route.

## Structure

- `frontend/` — application React (CRA + craco), UI shadcn/Tailwind. Les incidents, posts et commentaires sont chargés depuis l'API backend via un `AppDataProvider` (React Context, [frontend/src/context/AppDataContext.jsx](frontend/src/context/AppDataContext.jsx)) et l'authentification via `AuthProvider` ([frontend/src/context/AuthContext.jsx](frontend/src/context/AuthContext.jsx)). [frontend/src/lib/mockData.js](frontend/src/lib/mockData.js) ne contient plus que des données de référence statiques (taxonomie des incidents, couleurs, segments de routes indicatifs).
- `backend/` — API FastAPI avec une base SQLite locale (SQLAlchemy async + aiosqlite). Elle expose l'authentification (JWT + bcrypt) et les modèles du domaine (incidents, posts, commentaires), et alimente le mode « avant de partir ».

## Fonctionnalité « Avant de partir »

`POST /api/route/scan` prend un départ et une destination et renvoie :

1. **un itinéraire réel** (géocodage + tracé routier via GraphHopper) ;
2. **les incidents citoyens réellement sur le trajet** — filtrés dans un couloir autour du tracé, pas toute la base (voir [backend/routing.py](backend/routing.py)) ;
3. **un contournement** des zones graves (inondations, routes coupées) via l'évitement de polygones de GraphHopper, avec le gain de temps estimé ;
4. **une recommandation en langage naturel** rédigée par Claude ([backend/ai.py](backend/ai.py)).

Le tout se dégrade proprement **sans clé** : géocodage via un petit répertoire des quartiers d'Abidjan, tracé en ligne droite, et recommandation déterministe basée sur des règles — la fonctionnalité reste utilisable pour la démo.

## Lancer le projet

### Frontend

```bash
cd frontend
yarn install
yarn start
```
Ouvre [http://localhost:3000](http://localhost:3000).

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate  # ou source .venv/bin/activate sous Unix
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```
Une base `routepulse.db` (SQLite) est créée et pré-remplie automatiquement au premier démarrage.

### Variables d'environnement (backend, toutes optionnelles)

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | Surcharge la base SQLite (ex. Postgres). |
| `CORS_ORIGINS` | Origines autorisées, séparées par des virgules. |
| `JWT_SECRET` | Secret de signature des tokens (à définir en production). |
| `GRAPHHOPPER_API_KEY` | Active le géocodage et le routage réels du mode « avant de partir ». Sans clé, un fallback hors-ligne est utilisé. |
| `ANTHROPIC_API_KEY` | Active la recommandation d'itinéraire rédigée par Claude. Sans clé, une recommandation à base de règles est utilisée. |

Les clés se placent dans un fichier `backend/.env` (chargé au démarrage). Elles ne sont **jamais** exposées au frontend : tous les appels externes passent par le backend.

## Tests

- Backend : `cd backend && pytest` (couvre la géométrie et la corrélation incidents/itinéraire du mode « avant de partir »).
- Frontend : `cd frontend && yarn test`.
