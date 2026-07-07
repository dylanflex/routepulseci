"""Wipe and repopulate the database with the full demo dataset.

Usage (from the backend/ directory, with the venv active):

    python reseed.py

Unlike the automatic first-run seeding (server.seed_if_empty), this drops and
recreates every table first, so it can be re-run at any time to refresh the
demo data. Stop the API server before running it to avoid a SQLite write lock.
"""

import asyncio

from server import Base, SessionLocal, engine, seed_dataset


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        await seed_dataset(session)
    await engine.dispose()
    print("Database reseeded with the full demo dataset.")


if __name__ == "__main__":
    asyncio.run(main())
