"""WSGI entrypoint for cPanel/Passenger shared hosting (e.g. LWS mutualisé).

Passenger on classic shared hosting only speaks WSGI; FastAPI/Starlette are
ASGI-only. `a2wsgi.ASGIMiddleware` bridges the two by running the ASGI app's
event loop per request inside a synchronous WSGI call — the standard way to
run an ASGI app under a host that doesn't offer native ASGI/uvicorn support.

This is what cPanel's "Setup Python App" is pointed at (startup file), and it
must expose a WSGI-callable named `application` — cPanel's wizard assumes
that name. Everywhere else (local dev, a VPS, Docker) keep using
`uvicorn server:app` directly; this file only exists for Passenger.
"""

import asyncio
import sys
from pathlib import Path

# Passenger may invoke this file with a different cwd than this directory —
# make sure `server` and its sibling modules (ai, routing, ...) are always
# importable regardless of the app root Passenger was configured with.
sys.path.insert(0, str(Path(__file__).parent))

from a2wsgi import ASGIMiddleware  # noqa: E402

from server import Base, SessionLocal, app, engine, seed_if_empty  # noqa: E402


# a2wsgi.ASGIMiddleware only forwards HTTP requests — it never sends the ASGI
# "lifespan" events, so FastAPI's `lifespan()` (which creates the schema and
# seeds demo data on first run, see server.py) would otherwise never run and
# every DB-touching endpoint would 500 on a fresh database. Run that same
# bootstrap directly, once, at worker startup instead.
async def _bootstrap() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        await seed_if_empty(session)


asyncio.run(_bootstrap())

# mypy sees a structural mismatch between a2wsgi's own ASGI protocol types
# and Starlette's — cosmetic (verified against real endpoints under this
# exact adapter), not a runtime issue.
application = ASGIMiddleware(app)  # type: ignore[arg-type]
