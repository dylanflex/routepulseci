import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Collection, List

import bcrypt
import httpx
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    case,
    func,
    select,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from starlette.middleware.cors import CORSMiddleware

import ai
import gamification
import routing
import seed_data

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# SQLite database (local file, zero server setup). Override with DATABASE_URL
# to point at Postgres/MySQL etc. later without touching the models below.
DATABASE_URL = os.environ.get(
    "DATABASE_URL", f"sqlite+aiosqlite:///{ROOT_DIR / 'routepulse.db'}"
)
engine = create_async_engine(DATABASE_URL)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

JWT_SECRET_DEFAULT = "dev-secret-change-in-production"
JWT_SECRET = os.environ.get("JWT_SECRET", JWT_SECRET_DEFAULT)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 7


class Base(DeclarativeBase):
    pass


class UserORM(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    avatar: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class IncidentORM(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    road: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False)
    # Starts at 0: an incident is a claim, not a fact, until someone else
    # backs it up. Starting at 1 would let every fresh report masquerade as
    # already community-validated, which is exactly the trust signal the
    # "avant de partir" routing recommendation relies on.
    confirmed: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class PostORM(Base):
    __tablename__ = "posts"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    # The author's identity lives once in UserORM; name/avatar/badge are
    # resolved live at read time (see resolve_authors) instead of copied onto
    # every post. A copy would freeze a user's badge at whatever tier they had
    # when they wrote *that* post, so the same author's older and newer posts
    # would show two different badges as soon as they level up.
    author_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False
    )
    location: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(String, nullable=False)
    image: Mapped[str | None] = mapped_column(String, nullable=True)
    likes: Mapped[int] = mapped_column(Integer, default=0)
    comments_count: Mapped[int] = mapped_column(Integer, default=0)
    shares: Mapped[int] = mapped_column(Integer, default=0)
    # Same reasoning as IncidentORM.confirmed: starts unvalidated.
    confirmed: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class CommentORM(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    post_id: Mapped[str] = mapped_column(String, ForeignKey("posts.id"), nullable=False)
    # Nullable: seeded demo comments are attributed to their seeded account
    # (see seed_dataset), but the column predates this and stays optional so a
    # pre-existing row without one doesn't become unreadable. Lets a comment be
    # tied to a real account instead of just a free-text display name — the
    # difference between "attributable, moderatable" and not.
    user_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id"), nullable=True
    )
    author: Mapped[str] = mapped_column(String, nullable=False)
    avatar: Mapped[str] = mapped_column(String, default="")
    text: Mapped[str] = mapped_column(String, nullable=False)
    likes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


# "Who liked / confirmed which post" — one row per (post, user) pair makes a
# vote idempotent: the second click from the same user toggles it off instead
# of inflating the counter. This is the reliability signal, so it must not be
# forgeable by replaying the request.
class PostLikeORM(Base):
    __tablename__ = "post_likes"

    post_id: Mapped[str] = mapped_column(
        String, ForeignKey("posts.id"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), primary_key=True
    )


class PostConfirmORM(Base):
    __tablename__ = "post_confirms"

    post_id: Mapped[str] = mapped_column(
        String, ForeignKey("posts.id"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), primary_key=True
    )


# Same idempotency guard as PostConfirmORM, for incidents. Without it,
# confirm_incident was a bare +1 anyone could script-replay indefinitely on
# the exact data that drives the "avant de partir" avoid/reroute decision.
class IncidentConfirmORM(Base):
    __tablename__ = "incident_confirms"

    incident_id: Mapped[str] = mapped_column(
        String, ForeignKey("incidents.id"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), primary_key=True
    )


async def get_session():
    async with SessionLocal() as session:
        yield session


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> UserORM:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM]
        )
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await session.get(UserORM, payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> UserORM | None:
    """Like get_current_user but returns None instead of 401 when no/invalid
    token is present. Used by read endpoints that personalize their output
    (liked_by_me / confirmed_by_me) but stay public."""
    if credentials is None:
        return None
    try:
        payload = jwt.decode(
            credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM]
        )
    except jwt.InvalidTokenError:
        return None
    return await session.get(UserORM, payload["sub"])


async def seed_dataset(session: AsyncSession):
    """Populate the DB with the full demo dataset (see seed_data.py).

    Assumes the incident/post/user tables are empty. Shared by first-run
    seeding (seed_if_empty) and the standalone reseed.py script.
    """
    now = datetime.now(timezone.utc)

    # One bcrypt hash reused for every demo contributor — these accounts only
    # exist to make community stats reflect a populated DB, they never log in.
    shared_hash = hash_password(seed_data.DEMO_PASSWORD)
    # seed_data.USERS' badge column is now just a human hint about the
    # intended demo spread — actual badges are computed live from each
    # account's real seeded posts/confirmations (see resolve_authors), so it
    # isn't read here.
    meta_by_username = {}
    users = []
    for username, display_name, avatar, _badge in seed_data.USERS:
        meta_by_username[username] = (display_name, avatar)
        users.append(
            UserORM(
                username=username,
                display_name=display_name,
                password_hash=shared_hash,
                avatar=avatar,
            )
        )
    session.add_all(users)
    await session.flush()  # assign each user.id for the comment FK below
    user_id_by_username = {u.username: u.id for u in users}

    session.add_all(
        [
            IncidentORM(
                type=itype,
                lat=lat,
                lng=lng,
                road=road,
                severity=severity,
                confirmed=confirmed,
                created_at=now - timedelta(minutes=age),
            )
            for (itype, lat, lng, road, severity, confirmed, age) in seed_data.INCIDENTS
        ]
    )

    for (
        username,
        location,
        ptype,
        severity,
        text,
        image,
        likes,
        shares,
        confirmed,
        age,
        comments,
    ) in seed_data.POSTS:
        post = PostORM(
            author_id=user_id_by_username[username],
            location=location,
            type=ptype,
            severity=severity,
            text=text,
            image=image,
            likes=likes,
            comments_count=len(comments),
            shares=shares,
            confirmed=confirmed,
            created_at=now - timedelta(minutes=age),
        )
        session.add(post)
        await session.flush()  # assign post.id for the comment FK
        for c_user, c_text, c_likes, c_age in comments:
            c_name, c_avatar = meta_by_username.get(c_user, (c_user, ""))
            session.add(
                CommentORM(
                    post_id=post.id,
                    # Seeded commenters are real (seeded) accounts, so attribute
                    # the comment properly instead of leaving user_id empty.
                    user_id=user_id_by_username.get(c_user),
                    author=c_name,
                    avatar=c_avatar,
                    text=c_text,
                    likes=c_likes,
                    created_at=now - timedelta(minutes=c_age),
                )
            )

    await session.commit()


async def seed_if_empty(session: AsyncSession):
    existing = await session.execute(select(IncidentORM).limit(1))
    if existing.scalar_one_or_none() is not None:
        return
    await seed_dataset(session)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Tokens signed with the built-in dev secret are forgeable — anyone can mint
    # a valid token for any user. Loud warning so this never ships unnoticed.
    if JWT_SECRET == JWT_SECRET_DEFAULT:
        logging.warning(
            "JWT_SECRET is the built-in dev default — set a real JWT_SECRET "
            "before any real deployment (tokens are otherwise forgeable)."
        )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        await seed_if_empty(session)
    yield
    await engine.dispose()


app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")


# --- Schemas -----------------------------------------------------------


class RegisterInput(BaseModel):
    username: str
    password: str
    display_name: str


class LoginInput(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str
    display_name: str
    avatar: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class IncidentType(str, Enum):
    degraded = "degraded"
    accident = "accident"
    jam = "jam"
    flood = "flood"
    police = "police"
    works = "works"


class Severity(str, Enum):
    fluid = "fluid"
    dense = "dense"
    blocked = "blocked"
    danger = "danger"


class IncidentCreate(BaseModel):
    type: IncidentType
    lat: float
    lng: float
    road: str
    severity: Severity


class IncidentOut(BaseModel):
    id: str
    type: str
    lat: float
    lng: float
    road: str
    severity: str
    confirmed: int
    confirmed_by_me: bool
    created_at: datetime


class Author(BaseModel):
    name: str
    handle: str
    avatar: str
    verified: bool
    badge: str


class PostCreate(BaseModel):
    location: str
    type: IncidentType
    severity: Severity
    text: str
    image: str | None = None


class PostOut(BaseModel):
    id: str
    author: Author
    location: str
    type: str
    severity: str
    text: str
    image: str | None
    likes: int
    comments: int
    shares: int
    confirmed: int
    liked_by_me: bool
    confirmed_by_me: bool
    created_at: datetime


class CommentCreate(BaseModel):
    text: str


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    post_id: str
    user_id: str | None
    author: str
    avatar: str
    text: str
    likes: int
    created_at: datetime


async def resolve_authors(
    session: AsyncSession, user_ids: Collection[str]
) -> dict[str, dict]:
    """Live {name, handle, avatar, verified, badge} per user id, computed from
    their current display name/avatar and total posts + confirmations — the
    same tier calculation the leaderboard and /me/stats use. Batched by id so
    listing N posts costs one query instead of N.
    """
    if not user_ids:
        return {}
    rows = await session.execute(
        select(
            UserORM.id,
            UserORM.display_name,
            UserORM.username,
            UserORM.avatar,
            func.count(PostORM.id),
            func.coalesce(func.sum(PostORM.confirmed), 0),
        )
        .join(PostORM, PostORM.author_id == UserORM.id)
        .where(UserORM.id.in_(user_ids))
        .group_by(UserORM.id)
    )
    authors: dict[str, dict] = {}
    for user_id, name, username, avatar, posts, confirmations in rows.all():
        tier = gamification.tier_for_points(
            gamification.points_for(posts, int(confirmations))
        )
        authors[user_id] = {
            "name": name,
            "handle": f"@{username}",
            "avatar": avatar,
            "verified": gamification.is_verified(tier),
            "badge": tier,
        }
    return authors


def serialize_post(
    p: PostORM,
    author: dict,
    liked_ids: Collection[str] = (),
    confirmed_ids: Collection[str] = (),
) -> dict:
    return {
        "id": p.id,
        "author": author,
        "location": p.location,
        "type": p.type,
        "severity": p.severity,
        "text": p.text,
        "image": p.image,
        "likes": p.likes,
        "comments": p.comments_count,
        "shares": p.shares,
        "confirmed": p.confirmed,
        "liked_by_me": p.id in liked_ids,
        "confirmed_by_me": p.id in confirmed_ids,
        "created_at": p.created_at,
    }


def serialize_incident(inc: IncidentORM, confirmed_ids: Collection[str] = ()) -> dict:
    return {
        "id": inc.id,
        "type": inc.type,
        "lat": inc.lat,
        "lng": inc.lng,
        "road": inc.road,
        "severity": inc.severity,
        "confirmed": inc.confirmed,
        "confirmed_by_me": inc.id in confirmed_ids,
        "created_at": inc.created_at,
    }


async def user_incident_confirm_set(
    user: UserORM | None, session: AsyncSession
) -> set[str]:
    """Incident ids the given user has confirmed (empty for anonymous)."""
    if user is None:
        return set()
    result = await session.execute(
        select(IncidentConfirmORM.incident_id).where(
            IncidentConfirmORM.user_id == user.id
        )
    )
    return set(result.scalars().all())


async def user_post_vote_sets(
    user: UserORM | None, session: AsyncSession
) -> tuple[set[str], set[str]]:
    """Post ids the given user has liked / confirmed (empty for anonymous)."""
    if user is None:
        return set(), set()
    liked = await session.execute(
        select(PostLikeORM.post_id).where(PostLikeORM.user_id == user.id)
    )
    confirmed = await session.execute(
        select(PostConfirmORM.post_id).where(PostConfirmORM.user_id == user.id)
    )
    return set(liked.scalars().all()), set(confirmed.scalars().all())


async def adjust_post_counter(
    session: AsyncSession, post_id: str, column: str, delta: int
) -> None:
    """Atomically bump a post counter in SQL, floored at 0.

    A read-modify-write in Python (post.likes += 1) drops updates when two
    users vote on the same post concurrently — both read the same value and
    one increment is lost. Doing it as a single UPDATE lets the database
    serialize it. Portable across SQLite (default) and Postgres.
    """
    col = getattr(PostORM, column)
    await session.execute(
        update(PostORM)
        .where(PostORM.id == post_id)
        .values({column: case((col + delta < 0, 0), else_=col + delta)})
    )


async def adjust_incident_counter(
    session: AsyncSession, incident_id: str, delta: int
) -> None:
    """Same atomic, floored-at-0 update as adjust_post_counter, for IncidentORM.confirmed."""
    col = IncidentORM.confirmed
    await session.execute(
        update(IncidentORM)
        .where(IncidentORM.id == incident_id)
        .values(confirmed=case((col + delta < 0, 0), else_=col + delta))
    )


async def get_post_or_404(post_id: str, session: AsyncSession) -> PostORM:
    post = await session.get(PostORM, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


async def get_incident_or_404(incident_id: str, session: AsyncSession) -> IncidentORM:
    incident = await session.get(IncidentORM, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


# --- Auth -----------------------------------------------------------


def initials_for(display_name: str) -> str:
    parts = display_name.split()
    return ("".join(p[0] for p in parts[:2]) or "U").upper()


@api_router.post("/auth/register", response_model=TokenOut)
async def register(
    payload: RegisterInput, session: AsyncSession = Depends(get_session)
):
    existing = await session.execute(
        select(UserORM).where(UserORM.username == payload.username)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Username already taken")
    user = UserORM(
        username=payload.username,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
        avatar=initials_for(payload.display_name),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return {"access_token": create_access_token(user.id), "user": user}


@api_router.post("/auth/login", response_model=TokenOut)
async def login(payload: LoginInput, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(UserORM).where(UserORM.username == payload.username)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"access_token": create_access_token(user.id), "user": user}


@api_router.get("/auth/me", response_model=UserOut)
async def me(current_user: UserORM = Depends(get_current_user)):
    return current_user


# --- Incidents -----------------------------------------------------------


@api_router.get("/incidents", response_model=List[IncidentOut])
async def list_incidents(
    current_user: UserORM | None = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(IncidentORM).order_by(IncidentORM.created_at.desc())
    )
    confirmed_ids = await user_incident_confirm_set(current_user, session)
    return [serialize_incident(i, confirmed_ids) for i in result.scalars().all()]


@api_router.get("/stats")
async def community_stats(session: AsyncSession = Depends(get_session)):
    """Live community numbers for the landing page — derived from the real DB
    instead of hardcoded marketing figures."""
    active_alerts = await session.scalar(select(func.count()).select_from(IncidentORM))
    # People who have actually posted, not every registered account — a more
    # honest "community" number that a signed-up lurker doesn't inflate.
    contributors = await session.scalar(
        select(func.count(func.distinct(PostORM.author_id)))
    )
    reports = await session.scalar(select(func.count()).select_from(PostORM))
    confirmations = await session.scalar(
        select(func.coalesce(func.sum(IncidentORM.confirmed), 0))
    )
    return {
        "activeAlerts": active_alerts or 0,
        "contributors": contributors or 0,
        "reports": reports or 0,
        "confirmations": int(confirmations or 0),
        "citiesCovered": 1,  # Abidjan today; grows as coverage expands.
    }


# --- Community ranking (gamification) ------------------------------------


@api_router.get("/leaderboard")
async def leaderboard(limit: int = 10, session: AsyncSession = Depends(get_session)):
    """Top contributors by points, derived live from posts + confirmations
    received. Drives the engagement loop (see gamification.py)."""
    rows = await session.execute(
        select(
            UserORM.display_name,
            UserORM.username,
            UserORM.avatar,
            func.count(PostORM.id).label("posts"),
            func.coalesce(func.sum(PostORM.confirmed), 0).label("confirmations"),
        )
        .join(PostORM, PostORM.author_id == UserORM.id)
        .group_by(UserORM.id)
    )
    entries = []
    for name, username, avatar, posts, confirmations in rows.all():
        pts = gamification.points_for(posts, int(confirmations))
        entries.append(
            {
                "name": name,
                "handle": f"@{username}",
                "avatar": avatar,
                "posts": posts,
                "confirmations": int(confirmations),
                "points": pts,
                "tier": gamification.tier_for_points(pts),
            }
        )
    entries.sort(key=lambda e: e["points"], reverse=True)
    for rank, entry in enumerate(entries, start=1):
        entry["rank"] = rank
    return entries[: max(1, limit)]


@api_router.get("/me/stats")
async def my_stats(
    current_user: UserORM = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """The signed-in user's contribution points, tier and distance to the next
    tier — the "what do I need to level up" data for the profile."""
    posts, confirmations = (
        await session.execute(
            select(func.count(), func.coalesce(func.sum(PostORM.confirmed), 0)).where(
                PostORM.author_id == current_user.id
            )
        )
    ).one()
    confirmations = int(confirmations)
    points = gamification.points_for(posts, confirmations)
    tier = gamification.tier_for_points(points)
    return {
        "posts": posts,
        "confirmations": confirmations,
        "points": points,
        "tier": tier,
        "verified": gamification.is_verified(tier),
        "next_tier": gamification.next_tier(points),
    }


@api_router.post("/incidents", response_model=IncidentOut)
async def create_incident(
    payload: IncidentCreate, session: AsyncSession = Depends(get_session)
):
    # Reporting stays anonymous by product choice (no account needed to warn
    # others). Confirming, below, is the trust signal and is not anonymous.
    incident = IncidentORM(**payload.model_dump())
    session.add(incident)
    await session.commit()
    await session.refresh(incident)
    return serialize_incident(incident)


@api_router.post("/incidents/{incident_id}/confirm", response_model=IncidentOut)
async def confirm_incident(
    incident_id: str,
    current_user: UserORM = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # Toggle, one confirmation per user — same idempotent pattern as
    # confirm_post. An unconditional +1 here would let a single script inflate
    # the exact signal the "avant de partir" avoid/reroute decision reads.
    incident = await get_incident_or_404(incident_id, session)
    existing = await session.get(
        IncidentConfirmORM, {"incident_id": incident_id, "user_id": current_user.id}
    )
    if existing is not None:
        await session.delete(existing)
        await adjust_incident_counter(session, incident_id, -1)
        confirmed_ids: set[str] = set()
    else:
        session.add(
            IncidentConfirmORM(incident_id=incident_id, user_id=current_user.id)
        )
        await adjust_incident_counter(session, incident_id, 1)
        confirmed_ids = {incident_id}
    await session.commit()
    await session.refresh(incident)
    return serialize_incident(incident, confirmed_ids)


@api_router.get("/road-conditions")
async def road_conditions(session: AsyncSession = Depends(get_session)):
    """Real road stretches near each incident, coloured by severity, for the
    live map. Cached per incident server-side (see routing._ROAD_SEGMENT_CACHE)."""
    result = await session.execute(select(IncidentORM))
    incidents = result.scalars().all()
    async with httpx.AsyncClient() as client:
        return await routing.road_conditions(incidents, client)


# --- Route scan ("avant de partir") --------------------------------------


class RouteScanInput(BaseModel):
    # "from" is a Python keyword, so accept it from JSON via an alias.
    model_config = ConfigDict(populate_by_name=True)
    from_: str = Field(alias="from")
    to: str


@api_router.post("/route/scan")
async def scan_route(
    payload: RouteScanInput, session: AsyncSession = Depends(get_session)
):
    async with httpx.AsyncClient() as client:
        origin = await routing.geocode(payload.from_, client)
        dest = await routing.geocode(payload.to, client)
        base = await routing.compute_route(origin, dest, client)

        result = await session.execute(select(IncidentORM))
        incidents = result.scalars().all()
        alerts = routing.incidents_on_route(
            incidents, base["route"], base["distance_m"]
        )

        severe = [a for a in alerts if a["severity"] in routing.SEVERE_SEVERITIES]
        reroute = await routing.compute_reroute(origin, dest, severe, base, client)

        # Correlate incidents against the alternative too, so the UI can put
        # the two routes side by side honestly (how many risky zones each hits).
        if reroute:
            reroute_alerts = routing.incidents_on_route(
                incidents, reroute["route"], 0.0
            )
            reroute["alerts_count"] = len(reroute_alerts)
            reroute["severe_count"] = sum(
                1 for a in reroute_alerts if a["severity"] in routing.SEVERE_SEVERITIES
            )

    recommendation = await ai.recommend(origin, dest, alerts, reroute)

    return {
        "from": origin,
        "to": dest,
        "distance_km": round(base["distance_m"] / 1000.0, 1),
        "duration_min": round(base["duration_min"]),
        "route": base["route"],
        "alerts": alerts,
        "severe_count": len(severe),
        "reroute": reroute,
        "recommendation": recommendation,
    }


@api_router.get("/geocode/suggest")
async def geocode_suggest(q: str):
    """Address autocomplete for the trip planner (up to ~6 candidates)."""
    async with httpx.AsyncClient() as client:
        return await routing.suggest(q, client)


# --- Posts -----------------------------------------------------------


@api_router.get("/posts", response_model=List[PostOut])
async def list_posts(
    current_user: UserORM | None = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(PostORM).order_by(PostORM.created_at.desc()))
    posts = result.scalars().all()
    liked_ids, confirmed_ids = await user_post_vote_sets(current_user, session)
    authors = await resolve_authors(session, {p.author_id for p in posts})
    return [
        serialize_post(p, authors[p.author_id], liked_ids, confirmed_ids) for p in posts
    ]


@api_router.post("/posts", response_model=PostOut)
async def create_post(
    payload: PostCreate,
    current_user: UserORM = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    post = PostORM(author_id=current_user.id, **payload.model_dump())
    session.add(post)
    await session.commit()
    await session.refresh(post)
    # Badge = earned tier (this post included), so the feed shows real
    # standing instead of a value frozen at whatever tier existed pre-post.
    authors = await resolve_authors(session, {current_user.id})
    return serialize_post(post, authors[current_user.id])


@api_router.post("/posts/{post_id}/like", response_model=PostOut)
async def like_post(
    post_id: str,
    current_user: UserORM = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # Toggle: the server owns the +1/-1, the client never sends a delta.
    post = await get_post_or_404(post_id, session)
    existing = await session.get(
        PostLikeORM, {"post_id": post_id, "user_id": current_user.id}
    )
    if existing is not None:
        await session.delete(existing)
        await adjust_post_counter(session, post_id, "likes", -1)
        liked = False
    else:
        session.add(PostLikeORM(post_id=post_id, user_id=current_user.id))
        await adjust_post_counter(session, post_id, "likes", 1)
        liked = True
    await session.commit()
    await session.refresh(post)
    _, confirmed_ids = await user_post_vote_sets(current_user, session)
    authors = await resolve_authors(session, {post.author_id})
    return serialize_post(
        post, authors[post.author_id], {post_id} if liked else set(), confirmed_ids
    )


@api_router.post("/posts/{post_id}/confirm", response_model=PostOut)
async def confirm_post(
    post_id: str,
    current_user: UserORM = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # Toggle: one confirmation per user, idempotent on repeat clicks.
    post = await get_post_or_404(post_id, session)
    existing = await session.get(
        PostConfirmORM, {"post_id": post_id, "user_id": current_user.id}
    )
    if existing is not None:
        await session.delete(existing)
        await adjust_post_counter(session, post_id, "confirmed", -1)
        confirmed = False
    else:
        session.add(PostConfirmORM(post_id=post_id, user_id=current_user.id))
        await adjust_post_counter(session, post_id, "confirmed", 1)
        confirmed = True
    await session.commit()
    await session.refresh(post)
    liked_ids, _ = await user_post_vote_sets(current_user, session)
    authors = await resolve_authors(session, {post.author_id})
    return serialize_post(
        post, authors[post.author_id], liked_ids, {post_id} if confirmed else set()
    )


# --- Comments -----------------------------------------------------------


@api_router.get("/posts/{post_id}/comments", response_model=List[CommentOut])
async def list_comments(post_id: str, session: AsyncSession = Depends(get_session)):
    await get_post_or_404(post_id, session)
    result = await session.execute(
        select(CommentORM)
        .where(CommentORM.post_id == post_id)
        .order_by(CommentORM.created_at)
    )
    return result.scalars().all()


@api_router.post("/posts/{post_id}/comments", response_model=CommentOut)
async def create_comment(
    post_id: str,
    payload: CommentCreate,
    current_user: UserORM = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    post = await get_post_or_404(post_id, session)
    comment = CommentORM(
        post_id=post_id,
        user_id=current_user.id,
        author=current_user.display_name,
        avatar=current_user.avatar,
        **payload.model_dump(),
    )
    session.add(comment)
    await adjust_post_counter(session, post_id, "comments_count", 1)
    await session.commit()
    await session.refresh(comment)
    return comment


# CORS is registered before the router purely for readability — middleware
# ordering is independent of when routes are attached.
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the router in the main app
app.include_router(api_router)

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)
