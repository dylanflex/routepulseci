# Passer RoutePulse sur PostgreSQL / PostGIS

RoutePulse tourne par défaut sur **SQLite** (zéro configuration, déployable sur
n'importe quel hébergement — y compris mutualisé). L'application est **agnostique
de base de données** grâce à SQLAlchemy : passer sur PostgreSQL ne demande
**aucune modification des modèles**, juste une variable d'environnement.

## Pourquoi ce document existe

Pour la démonstration, SQLite est le bon choix : rapide, portable, la suite de
117 tests tourne hors-ligne sur un fichier jetable. Ce guide décrit la bascule
vers **PostgreSQL** (passage à l'échelle : concurrence réelle, plusieurs
instances, sauvegardes managées) puis vers **PostGIS** (requêtes spatiales
natives) — l'étape « phase 2 » de la feuille de route.

---

## Étape 1 — PostgreSQL (bascule immédiate, sans changement de code)

Le pilote `asyncpg` est déjà dans `requirements.txt`.

```bash
# 1. Lancer un Postgres + PostGIS local
docker compose up -d          # voir docker-compose.yml

# 2. Pointer l'app dessus (au lieu de SQLite)
export DATABASE_URL="postgresql+asyncpg://routepulse:routepulse@localhost:5432/routepulse"

# 3. Créer le schéma + les données de démo, puis démarrer
python reseed.py
uvicorn server:app --reload --port 8000
```

C'est tout : `server.py` lit `DATABASE_URL`, crée les tables au démarrage
(`Base.metadata.create_all`) et sème le jeu de démo. Le même code, la même API.

> ⚠️ Différence de comportement à connaître : SQLite renvoie les colonnes
> `DateTime` en **naïf**, PostgreSQL en **aware**. Le helper
> `server.is_incident_active` gère déjà les deux (il ré-interprète un timestamp
> naïf comme UTC), donc l'expiration des incidents reste correcte — mais
> re-lancer la suite de tests contre Postgres avant un déploiement réel est
> recommandé.

### Hébergement managé (production)

Un Postgres managé avec PostGIS (Neon, Supabase, Railway) fournit une chaîne du
type `postgresql+asyncpg://user:pass@host/db?ssl=require`. Renseigner
`DATABASE_URL` dans l'environnement de l'hôte suffit. (L'hébergement mutualisé
cPanel/LWS n'offre généralement pas l'extension PostGIS : viser un Postgres
managé pour cette étape.)

---

## Étape 2 — PostGIS (requêtes spatiales natives)

Aujourd'hui, toute la géométrie est en **Python pur, déterministe et testée**
(`routing.haversine_m`, `routing.distance_to_route_m`, `clustering`,
corroboration du `trust`, `nearest_commune`). Cela fonctionne à l'échelle
d'Abidjan et reste **explicable** (un atout pour le jury et le régulateur).

Pour porter la charge sur PostGIS quand le volume l'exigera :

1. Ajouter `geoalchemy2` à `requirements.txt`.
2. Sur `IncidentORM`, ajouter une colonne géographique alimentée depuis lat/lng :
   ```python
   from geoalchemy2 import Geography
   geom: Mapped[object] = mapped_column(Geography("POINT", srid=4326))
   # à l'insertion : func.ST_MakePoint(lng, lat)
   ```
3. Créer un index spatial GiST sur `geom`.
4. Remplacer les recherches « dans un rayon » par `ST_DWithin` :
   - corroboration du `trust` (`server.count_corroborations`)
   - `clustering.cluster_incidents` → `ST_ClusterDBSCAN`
   - filtrage du corridor « avant de partir » → `ST_DWithin` sur `LineString`
5. Garder le chemin Python en **repli** (les tests hors-ligne en dépendent), ou
   provisionner une instance PostGIS dédiée à la CI.

Ce découplage — Python explicable maintenant, PostGIS quand le volume le
justifie — est volontaire : on ne réécrit pas le cœur le plus testé avant d'en
avoir le besoin réel.
