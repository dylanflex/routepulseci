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
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from starlette.middleware.cors import CORSMiddleware

import ai
import routing

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# SQLite database (local file, zero server setup). Override with DATABASE_URL
# to point at Postgres/MySQL etc. later without touching the models below.
DATABASE_URL = os.environ.get(
    "DATABASE_URL", f"sqlite+aiosqlite:///{ROOT_DIR / 'routepulse.db'}"
)
engine = create_async_engine(DATABASE_URL)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
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
    confirmed: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class PostORM(Base):
    __tablename__ = "posts"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    author_name: Mapped[str] = mapped_column(String, nullable=False)
    author_handle: Mapped[str] = mapped_column(String, default="")
    author_avatar: Mapped[str] = mapped_column(String, default="")
    author_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    author_badge: Mapped[str] = mapped_column(String, default="")
    location: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(String, nullable=False)
    image: Mapped[str | None] = mapped_column(String, nullable=True)
    likes: Mapped[int] = mapped_column(Integer, default=0)
    comments_count: Mapped[int] = mapped_column(Integer, default=0)
    shares: Mapped[int] = mapped_column(Integer, default=0)
    confirmed: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class CommentORM(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    post_id: Mapped[str] = mapped_column(String, ForeignKey("posts.id"), nullable=False)
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


async def seed_if_empty(session: AsyncSession):
    existing = await session.execute(select(IncidentORM).limit(1))
    if existing.scalar_one_or_none() is not None:
        return

    now = datetime.now(timezone.utc)
    # Approximate real-world coordinates around Abidjan/Cocody, not surveyed road geometry.
    session.add_all(
        [
            IncidentORM(
                type="jam",
                lat=5.3720,
                lng=-3.9820,
                road="Bd Latrille",
                severity="blocked",
                confirmed=12,
                created_at=now - timedelta(minutes=6),
            ),
            IncidentORM(
                type="accident",
                lat=5.3210,
                lng=-4.0190,
                road="Bd de France",
                severity="blocked",
                confirmed=8,
                created_at=now - timedelta(minutes=14),
            ),
            IncidentORM(
                type="flood",
                lat=5.3350,
                lng=-3.9950,
                road="Corniche",
                severity="danger",
                confirmed=21,
                created_at=now - timedelta(minutes=3),
            ),
            IncidentORM(
                type="degraded",
                lat=5.3680,
                lng=-3.9750,
                road="Rue des Jardins",
                severity="dense",
                confirmed=4,
                created_at=now - timedelta(minutes=32),
            ),
            IncidentORM(
                type="works",
                lat=5.3600,
                lng=-3.9600,
                road="Bd VGE",
                severity="dense",
                confirmed=3,
                created_at=now - timedelta(minutes=60),
            ),
            IncidentORM(
                type="police",
                lat=5.3550,
                lng=-3.9650,
                road="Bd Giscard",
                severity="fluid",
                confirmed=2,
                created_at=now - timedelta(minutes=18),
            ),
        ]
    )

    p1 = PostORM(
        author_name="Aya K.",
        author_handle="@aya_abj",
        author_avatar="AK",
        author_verified=True,
        author_badge="Contributeur Or",
        location="Cocody, Riviera 3",
        type="jam",
        severity="blocked",
        text="Bouchon monstre sur la Riviera 3 après l'accident. Prendre le contournement par la Palmeraie 🙏 Ça n'avance plus depuis 20 min.",
        image="https://images.unsplash.com/photo-1708347456872-6ebd105740de?w=900&q=80",
        likes=142,
        comments_count=3,
        shares=34,
        confirmed=18,
        created_at=now - timedelta(minutes=8),
    )
    session.add_all(
        [
            p1,
            PostORM(
                author_name="Kouassi M.",
                author_handle="@kouassi_m",
                author_avatar="KM",
                author_verified=False,
                author_badge="Voisin vigilant",
                location="Yopougon, Bd Principal",
                type="degraded",
                severity="dense",
                text="Énorme nid de poule à Yop. Deux motos déjà tombées. Attention en venant du marché !",
                image=None,
                likes=87,
                comments_count=0,
                shares=19,
                confirmed=9,
                created_at=now - timedelta(minutes=22),
            ),
            PostORM(
                author_name="Fatou D.",
                author_handle="@fatoud",
                author_avatar="FD",
                author_verified=True,
                author_badge="Ambassadeur",
                location="Plateau, Bd Lagunaire",
                type="flood",
                severity="danger",
                text="Inondation sévère au Plateau après la pluie. La lagune déborde côté Boulay. Évitez absolument.",
                image="https://images.pexels.com/photos/7381785/pexels-photo-7381785.jpeg?w=900&q=80",
                likes=312,
                comments_count=0,
                shares=128,
                confirmed=42,
                created_at=now - timedelta(minutes=41),
            ),
            PostORM(
                author_name="Ibrahim S.",
                author_handle="@ibs_ci",
                author_avatar="IS",
                author_verified=False,
                author_badge="Nouveau",
                location="Marcory Zone 4",
                type="accident",
                severity="blocked",
                text="Collision entre un woro-woro et une berline au carrefour SOLIBRA. Les secours sont sur place.",
                image=None,
                likes=54,
                comments_count=0,
                shares=6,
                confirmed=5,
                created_at=now - timedelta(minutes=60),
            ),
        ]
    )
    await session.flush()

    session.add_all(
        [
            CommentORM(
                post_id=p1.id,
                author="Serge B.",
                avatar="SB",
                text="Confirmé, je suis coincé depuis 15 min. Merci du signalement 🙏",
                likes=12,
                created_at=now - timedelta(minutes=6),
            ),
            CommentORM(
                post_id=p1.id,
                author="Awa T.",
                avatar="AT",
                text="Il y a une déviation par la rue des Jardins pour ceux qui viennent d'Angré.",
                likes=8,
                created_at=now - timedelta(minutes=4),
            ),
            CommentORM(
                post_id=p1.id,
                author="Moussa L.",
                avatar="ML",
                text="La police vient d'arriver, ça devrait bouger.",
                likes=3,
                created_at=now - timedelta(minutes=2),
            ),
        ]
    )
    await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
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
    model_config = ConfigDict(from_attributes=True)
    id: str
    type: str
    lat: float
    lng: float
    road: str
    severity: str
    confirmed: int
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
    author: str
    avatar: str
    text: str
    likes: int
    created_at: datetime


def serialize_post(
    p: PostORM,
    liked_ids: Collection[str] = (),
    confirmed_ids: Collection[str] = (),
) -> dict:
    return {
        "id": p.id,
        "author": {
            "name": p.author_name,
            "handle": p.author_handle,
            "avatar": p.author_avatar,
            "verified": p.author_verified,
            "badge": p.author_badge,
        },
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
async def list_incidents(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(IncidentORM).order_by(IncidentORM.created_at.desc())
    )
    return result.scalars().all()


@api_router.post("/incidents", response_model=IncidentOut)
async def create_incident(
    payload: IncidentCreate, session: AsyncSession = Depends(get_session)
):
    incident = IncidentORM(**payload.model_dump())
    session.add(incident)
    await session.commit()
    await session.refresh(incident)
    return incident


@api_router.post("/incidents/{incident_id}/confirm", response_model=IncidentOut)
async def confirm_incident(
    incident_id: str, session: AsyncSession = Depends(get_session)
):
    incident = await get_incident_or_404(incident_id, session)
    incident.confirmed += 1
    await session.commit()
    await session.refresh(incident)
    return incident


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
    liked_ids, confirmed_ids = await user_post_vote_sets(current_user, session)
    return [serialize_post(p, liked_ids, confirmed_ids) for p in result.scalars().all()]


@api_router.post("/posts", response_model=PostOut)
async def create_post(
    payload: PostCreate,
    current_user: UserORM = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    post = PostORM(
        author_name=current_user.display_name,
        author_handle=f"@{current_user.username}",
        author_avatar=current_user.avatar,
        author_verified=False,
        author_badge="Contributeur",
        **payload.model_dump(),
    )
    session.add(post)
    await session.commit()
    await session.refresh(post)
    return serialize_post(post)


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
        post.likes = max(0, post.likes - 1)
        liked = False
    else:
        session.add(PostLikeORM(post_id=post_id, user_id=current_user.id))
        post.likes += 1
        liked = True
    await session.commit()
    await session.refresh(post)
    _, confirmed_ids = await user_post_vote_sets(current_user, session)
    return serialize_post(post, {post_id} if liked else set(), confirmed_ids)


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
        post.confirmed = max(0, post.confirmed - 1)
        confirmed = False
    else:
        session.add(PostConfirmORM(post_id=post_id, user_id=current_user.id))
        post.confirmed += 1
        confirmed = True
    await session.commit()
    await session.refresh(post)
    liked_ids, _ = await user_post_vote_sets(current_user, session)
    return serialize_post(post, liked_ids, {post_id} if confirmed else set())


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
        author=current_user.display_name,
        avatar=current_user.avatar,
        **payload.model_dump(),
    )
    session.add(comment)
    post.comments_count += 1
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
