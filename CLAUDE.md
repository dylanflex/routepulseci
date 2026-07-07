# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

RoutePulse CI is a collaborative traffic-reporting and social-feed app for Abidjan, Côte d'Ivoire: one-tap incident reporting (jam, accident, flood, pothole, police check, roadworks), a social feed to comment/confirm reports, and an **"avant de partir"** ("before you leave") mode that scans a real route and tells the driver what to expect before they set off.

- `frontend/` — CRA + craco, shadcn/Tailwind UI. Incidents/posts/comments come from the backend API via `AppDataProvider` ([frontend/src/context/AppDataContext.jsx](frontend/src/context/AppDataContext.jsx)); auth via `AuthProvider` ([frontend/src/context/AuthContext.jsx](frontend/src/context/AuthContext.jsx)). [frontend/src/lib/mockData.js](frontend/src/lib/mockData.js) only holds static reference data (incident taxonomy, colors) — no domain data lives there anymore.
- `backend/` — FastAPI + SQLAlchemy async + aiosqlite (local SQLite file, zero server setup). JWT (HS256) + bcrypt auth. One `backend/server.py` module holds the ORM models, Pydantic schemas, and all endpoints.

### "Avant de partir"

`POST /api/route/scan` takes a from/to and returns a real route (geocoding + road geometry via GraphHopper), the citizen incidents actually on that route (corridor-filtered, not the whole DB — see [backend/routing.py](backend/routing.py)), an optional detour around severe zones (floods, blocked roads), and a short natural-language recommendation written by Claude ([backend/ai.py](backend/ai.py)).

Everything degrades gracefully **without any key**: geocoding falls back to a small built-in gazetteer of Abidjan districts, routing falls back to a straight line, and the recommendation falls back to a deterministic rule-based summary. This keyless-fallback pattern is the norm for every external integration in this repo — don't add one without a fallback path.

## Commands

### Backend (from `backend/`)

```bash
python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate on Unix
pip install -r requirements.txt
uvicorn server:app --reload --port 8000          # creates + seeds routepulse.db on first run
```

Tests: `pytest` (all), `pytest test_api.py::test_name` (single test), `pytest -k "confirm"` (by keyword). `pytest.ini` pins `-n 2 --dist loadscope` (pytest-xdist) — tests within a class/module share one instance of the app and its SQLite file, so don't reorder addopts or run with a conflicting `-n`; use `pytest -n 0` to force serial.

Lint/format (config in `setup.cfg`): `black .`, `isort .`, `flake8 .`, `mypy .`.

`python reseed.py` wipes and repopulates the demo dataset from [backend/seed_data.py](backend/seed_data.py) — stop the running server first (SQLite write lock).

### Frontend (from `frontend/`)

```bash
yarn install
yarn start     # dev server on :3000
yarn build     # production build (craco build)
yarn test      # jest (craco test)
```

Single test: `yarn test src/pages/pages.smoke.test.js`, or `yarn test -t "test name"`.

**Windows build note**: parallel Terser minification has crashed with an access violation on memory-constrained Windows hosts once mapbox-gl is in the bundle (see the comment in `craco.config.js`, which already disables minifier parallelism and skips re-minifying mapbox-gl). If `yarn build` exits with a non-standard code (e.g. `3221225477`) and no compile error, it's this — just retry.

Requires `frontend/.env` with `REACT_APP_MAPBOX_TOKEN=pk.xxxxx` (a free public Mapbox token) — unlike the backend's keyless fallbacks, **the live map has no fallback** and stays blank without it.

### Deployment target: LWS shared hosting (cPanel/Passenger)

See the README's "Déploiement sur LWS" section for the full step-by-step. The two things that only exist for this target:

- `backend/passenger_wsgi.py` — Passenger (cPanel's "Setup Python App") only speaks WSGI, not ASGI, so this wraps `server.app` with `a2wsgi.ASGIMiddleware`. That adapter never forwards the ASGI `lifespan` protocol, so this file also runs the schema-creation/seed bootstrap itself at import time instead of relying on `server.py`'s `lifespan()` (which only fires under a real ASGI server like uvicorn). If you touch startup logic in `server.py`, check whether `passenger_wsgi.py` needs the same change.
- `frontend/public/.htaccess` — copied verbatim into `build/` by `yarn build`; gives Apache the SPA fallback rewrite (`react-router` paths 404 on refresh without it) and long-lived caching for CRA's fingerprinted assets.

## Architecture

### Backend (`backend/server.py` + focused modules)

- `server.py` — ORM models (`UserORM`, `IncidentORM`, `PostORM`, `CommentORM`, plus per-user vote tables), Pydantic schemas, and every `@api_router` endpoint. `ai.py`, `routing.py`, `gamification.py`, `seed_data.py` are deliberately import-cycle-free pure modules that `server.py` composes.
- **Anti-vote-spam pattern**: `PostLikeORM` / `PostConfirmORM` / `IncidentConfirmORM` each store one row per `(entity_id, user_id)` pair, making like/confirm an idempotent toggle instead of an unbounded counter — the second click from the same user undoes the first instead of inflating the count. Counter mutations always go through `adjust_post_counter` / `adjust_incident_counter`, which do a single atomic SQL `UPDATE ... SET col = col + delta` (floored at 0) rather than a Python read-modify-write, so concurrent votes can't drop an update.
- **Author info is resolved live, not stored**: `PostORM` only holds `author_id` (FK to `UserORM`). Display name, avatar, verified flag and badge/tier are computed on read by `resolve_authors()` (batched, not N+1) from the user's current posts + confirmations. This means a user's badge on an old post updates automatically as their standing changes — it is never frozen at post-creation time. Don't reintroduce denormalized author columns on `PostORM`.
- **Incidents are anonymous by product decision** (`POST /incidents` needs no auth — reporting shouldn't require an account), but **confirming an incident requires auth** (`IncidentConfirmORM`) since that's the trust signal the routing/reroute logic reads. `confirmed` counters start at 0 on both incidents and posts — a report is a claim until someone else backs it up, never pre-validated.
- `get_current_user` (401 if missing/invalid) vs `get_current_user_optional` (returns `None`) — the latter is for read endpoints (`GET /incidents`, `GET /posts`) that personalize output (`liked_by_me`/`confirmed_by_me`) but must stay publicly readable.
- `routing.py` owns all geometry (haversine, point-to-segment, corridor filtering), geocoding (GraphHopper + Abidjan gazetteer fallback, biased/bounded to Côte d'Ivoire so a generic place name doesn't resolve to a foreign namesake), and route computation/rerouting (perpendicular via-point detours around severe incidents, since GraphHopper's free plan has no custom-model area avoidance). These geometry helpers are pure/deterministic and unit-tested in `test_routing.py`.
- `gamification.py` is pure scoring: posts + confirmations → points → tier label. Tier labels double as the feed's badge vocabulary (`seed_data.USERS`' badge column is just a cosmetic hint for the demo spread — real badges are always computed live).

### Frontend (`frontend/src`)

- Two route trees: `Landing.jsx` (marketing page at `/`) and the app shell at `/app/*` (`AppShell.jsx` + `BottomNav`: Carte, Fil, Signaler, Trajet, Profil).
- `AppDataProvider` ([context/AppDataContext.jsx](frontend/src/context/AppDataContext.jsx)) owns a single react-query `QueryClient` for the whole app (incidents/posts/stats/leaderboard/road-conditions) and exposes mutation helpers that return promises so callers can `await` + toast on failure. `AuthContext` handles the JWT (stored in `localStorage`) separately.
- `TrafficMap.jsx` ([components/routepulse/TrafficMap.jsx](frontend/src/components/routepulse/TrafficMap.jsx)) is the one Mapbox GL wrapper, reused by the live map, the Trajet page, and the Landing page previews. It supports: an optional fullscreen toggle (`allowFullscreen`, CSS-overlay based rather than the native Fullscreen API, since iOS Safari doesn't support that on arbitrary elements) that, unless `showRoutePlanner={false}` is passed (Trajet already has its own inline planner), also surfaces a self-contained "avant de partir" mini trip planner so a route can be scanned without leaving fullscreen.
- `PlaceField` ([components/routepulse/PlaceField.jsx](frontend/src/components/routepulse/PlaceField.jsx)) is the shared debounced address-autocomplete input (backed by `GET /api/geocode/suggest`), used by both the Trajet page and TrafficMap's fullscreen planner — don't fork a second copy.
- Voice announcements ([lib/voice.js](frontend/src/lib/voice.js)) read the "avant de partir" recommendation aloud via the browser's native `SpeechSynthesis` API — no backend key, no cost, silently disabled on unsupported browsers. `VoiceToggle` is the shared mute control; keep it visible next to anything that calls `speak()` so it can be muted mid-demo.
- `lib/traffic.js` centralizes severity/incident-type color and icon lookups plus `RECO_STYLE` (recommendation level → icon/tone/background) — reused by every place that renders a recommendation or a severity badge; extend it rather than hardcoding colors per component.
