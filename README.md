# RoutePulse CI

RoutePulse est un prototype de signalement et de carte de trafic collaboratifs pour la Côte d'Ivoire (Abidjan) : signalement d'incidents (embouteillage, accident, inondation, nid de poule, contrôle, travaux) en un clic, fil social pour commenter/confirmer, et un mode « avant de partir » pour scanner un itinéraire.

## Structure

- `frontend/` — application React (CRA + craco), UI shadcn/Tailwind. Toutes les données (incidents, posts, commentaires) vivent dans un `AppDataProvider` (React Context, [frontend/src/context/AppDataContext.jsx](frontend/src/context/AppDataContext.jsx)) initialisé depuis des mocks ([frontend/src/lib/mockData.js](frontend/src/lib/mockData.js)). Cet état est partagé entre les pages mais n'est pas persisté côté serveur — un rechargement de page repart des mocks.
- `backend/` — API FastAPI minimale avec une base SQLite locale (via SQLAlchemy async + aiosqlite). Elle n'expose pour l'instant qu'un endpoint `/api/status` de vérification ; le frontend ne l'appelle pas encore.

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
Une base `routepulse.db` (SQLite) est créée automatiquement au premier démarrage. Aucun `.env` n'est requis en local ; `DATABASE_URL` et `CORS_ORIGINS` peuvent être surchargés si besoin.

## État du projet

Prototype : l'app frontend fonctionne de façon autonome avec des données mockées partagées en mémoire (likes, commentaires, nouveaux signalements se reflètent bien entre les pages tant que l'onglet reste ouvert). Le backend existe mais n'est pas encore branché aux vrais modèles du domaine (incidents/posts/commentaires) — c'est la prochaine étape pour une vraie persistance.
