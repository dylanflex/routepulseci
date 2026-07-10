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

Contrairement aux clés backend ci-dessous, la carte (Mapbox GL JS) n'a **pas** de repli hors-ligne : il faut un `frontend/.env` avec

```
REACT_APP_MAPBOX_TOKEN=pk.xxxxx
```

(jeton public `pk.*`, gratuit sur [mapbox.com](https://www.mapbox.com), sans danger à exposer côté client). Sans lui, la carte reste blanche.

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
| `DATABASE_URL` | Surcharge la base SQLite par PostgreSQL/PostGIS (`postgresql+asyncpg://…`) — voir [`backend/POSTGRES.md`](backend/POSTGRES.md). |
| `CORS_ORIGINS` | Origines autorisées, séparées par des virgules. |
| `JWT_SECRET` | Secret de signature des tokens (à définir en production). |
| `GRAPHHOPPER_API_KEY` | Active le géocodage et le routage réels du mode « avant de partir ». Sans clé, un fallback hors-ligne est utilisé. |
| `ANTHROPIC_API_KEY` | Active la recommandation d'itinéraire rédigée par Claude. Sans clé, une recommandation à base de règles est utilisée. |

Les clés se placent dans un fichier `backend/.env` (chargé au démarrage). Elles ne sont **jamais** exposées au frontend : tous les appels externes passent par le backend.

## Tests

- Backend : `cd backend && pytest` (couvre la géométrie et la corrélation incidents/itinéraire du mode « avant de partir »).
- Frontend : `cd frontend && yarn test`.

## Déploiement sur LWS (hébergement mutualisé)

LWS mutualisé tourne sous cPanel + Apache/Passenger, qui ne parle que WSGI — pas nativement adapté à une API FastAPI (ASGI) ni à un serveur Node. Le backend passe donc par un petit pont, le frontend est déployé en fichiers statiques.

### Backend (API Python via Passenger)

1. Dépose le contenu de `backend/` (via Git, FTP ou le gestionnaire de fichiers cPanel) dans un dossier dédié, par exemple `routepulse-api`.
2. Dans cPanel → **Setup Python App**, crée une application :
   - **Version Python** : la plus récente proposée (3.11+).
   - **Application root** : le dossier déposé à l'étape 1.
   - **Application URL** : un sous-domaine dédié (ex. `api.tondomaine.com`) plutôt qu'un sous-dossier, pour ne pas entrer en conflit avec le routage du frontend.
   - **Application startup file** : `passenger_wsgi.py` (fourni — adapte l'ASGI de FastAPI en WSGI via `a2wsgi`, et déclenche lui-même la création des tables + le seed puisque Passenger n'envoie jamais l'événement `lifespan`).
   - **Application Entry point** : `application`.
3. Depuis le terminal fourni par cPanel pour cette app (bouton *"Enter to the virtual environment"*) : `pip install -r requirements.txt`.
4. Dans l'onglet *Environment variables* de la même interface, définis au minimum :
   - `JWT_SECRET` → une vraie valeur aléatoire (**jamais** la valeur par défaut en production — sinon n'importe qui peut forger un token).
   - `CORS_ORIGINS` → l'URL exacte du frontend déployé (ex. `https://tondomaine.com`).
   - `GRAPHHOPPER_API_KEY` / `ANTHROPIC_API_KEY` → optionnelles, activent le routage réel et la recommandation IA au lieu des fallbacks hors-ligne.
5. Redémarre l'application depuis cPanel après toute modification (code ou variables).

`routepulse.db` (SQLite) se crée directement dans ce dossier — aucune base externe requise.

### Frontend (build statique)

1. En local, crée `frontend/.env.production` :
   ```
   REACT_APP_BACKEND_URL=https://api.tondomaine.com
   REACT_APP_MAPBOX_TOKEN=pk.xxxxx
   ```
   CRA injecte ces valeurs **au moment du build**, pas à l'exécution — il faut rebuilder (`yarn build`) si l'une d'elles change.
2. `cd frontend && yarn build`.
3. Dépose le **contenu** du dossier `build/` (pas le dossier lui-même) dans `public_html` (ou le sous-dossier du domaine choisi) via FTP/gestionnaire de fichiers cPanel.
4. `frontend/public/.htaccess` (fourni, copié automatiquement dans `build/` par `yarn build`) fait fonctionner les routes React (`/app/carte`, etc.) sur un rafraîchissement ou un lien direct — sans lui, Apache renvoie une 404. Si le site est servi depuis un sous-dossier plutôt que la racine du domaine, ajuste `RewriteBase` dans ce fichier.

### Note mémoire (Windows local uniquement)

Sur une machine Windows avec peu de RAM, `yarn build` peut planter avec un code de sortie non standard (ex. `3221225477`, un access violation) à cause de la minification parallèle de gros bundles (mapbox-gl). `frontend/craco.config.js` désactive déjà ce parallélisme ; en cas de plantage malgré tout, relance simplement la commande.
