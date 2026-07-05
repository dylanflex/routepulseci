"""End-to-end tests for the RoutePulse HTTP API.

Runs the real FastAPI app against a throwaway SQLite file (set via
DATABASE_URL before `server` is imported, since the engine is built at import
time). The lifespan handler creates the schema and seeds demo rows, so these
tests exercise the same wiring the app uses in production.

Each test mints a unique username so the module-shared database stays free of
cross-test collisions (pytest.ini pins a module to a single xdist worker).
"""

import os
import tempfile
import uuid

# Point the app at an isolated database *before* importing it.
_DB_PATH = os.path.join(tempfile.gettempdir(), f"routepulse_test_{uuid.uuid4().hex}.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_DB_PATH}"

# Keep tests hermetic/offline regardless of a local .env: force the keyless
# fallbacks (straight-line routing, rule-based recommendation) so no test hits
# the real GraphHopper or Anthropic APIs. routing/ai use load_dotenv(override=
# False), so these empty values win.
os.environ["GRAPHHOPPER_API_KEY"] = ""
os.environ["ANTHROPIC_API_KEY"] = ""

import pytest
from fastapi.testclient import TestClient

import server


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as c:
        yield c
    # Best-effort cleanup of the temp database file.
    try:
        os.remove(_DB_PATH)
    except OSError:
        pass


def register(client, display_name="Test User"):
    """Register a fresh user and return (auth_headers, user_json)."""
    username = f"user_{uuid.uuid4().hex[:12]}"
    res = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": "s3cret!",
            "display_name": display_name,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"], username


# --- Auth ----------------------------------------------------------------


def test_register_login_me_flow(client):
    headers, user, username = register(client)
    assert user["username"] == username

    login = client.post(
        "/api/auth/login", json={"username": username, "password": "s3cret!"}
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == username


def test_me_without_token_is_401(client):
    assert client.get("/api/auth/me").status_code == 401


def test_login_wrong_password_is_401(client):
    _, _, username = register(client)
    res = client.post(
        "/api/auth/login", json={"username": username, "password": "nope"}
    )
    assert res.status_code == 401


def test_register_duplicate_username_is_400(client):
    _, _, username = register(client)
    res = client.post(
        "/api/auth/register",
        json={"username": username, "password": "other", "display_name": "Dup"},
    )
    assert res.status_code == 400


# --- Incidents (anonymous by design) -------------------------------------


def test_create_incident_then_lists(client):
    payload = {
        "type": "jam",
        "lat": 5.36,
        "lng": -4.0,
        "road": "Bd Test",
        "severity": "dense",
    }
    created = client.post("/api/incidents", json=payload)
    assert created.status_code == 200, created.text
    incident_id = created.json()["id"]

    listed = client.get("/api/incidents")
    assert listed.status_code == 200
    assert incident_id in [i["id"] for i in listed.json()]


def test_confirm_incident_increments(client):
    created = client.post(
        "/api/incidents",
        json={
            "type": "accident",
            "lat": 5.32,
            "lng": -4.01,
            "road": "Bd X",
            "severity": "blocked",
        },
    )
    incident_id = created.json()["id"]
    before = created.json()["confirmed"]

    confirmed = client.post(f"/api/incidents/{incident_id}/confirm")
    assert confirmed.status_code == 200
    assert confirmed.json()["confirmed"] == before + 1


def test_invalid_incident_type_is_422(client):
    res = client.post(
        "/api/incidents",
        json={
            "type": "pas_un_type",
            "lat": 5.36,
            "lng": -4.0,
            "road": "X",
            "severity": "dense",
        },
    )
    assert res.status_code == 422


def test_invalid_severity_is_422(client):
    res = client.post(
        "/api/incidents",
        json={
            "type": "jam",
            "lat": 5.36,
            "lng": -4.0,
            "road": "X",
            "severity": "supersonic",
        },
    )
    assert res.status_code == 422


# --- Posts ---------------------------------------------------------------


def test_create_post_requires_auth(client):
    res = client.post(
        "/api/posts",
        json={"location": "L", "type": "jam", "severity": "dense", "text": "hi"},
    )
    assert res.status_code == 401


def test_create_and_list_post(client):
    headers, _, _ = register(client)
    created = client.post(
        "/api/posts",
        headers=headers,
        json={
            "location": "Cocody",
            "type": "flood",
            "severity": "danger",
            "text": "Inondation",
        },
    )
    assert created.status_code == 200, created.text
    post = created.json()
    assert post["liked_by_me"] is False
    assert post["confirmed_by_me"] is False

    listed = client.get("/api/posts")
    assert post["id"] in [p["id"] for p in listed.json()]


def test_like_requires_auth(client):
    headers, _, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()
    assert client.post(f"/api/posts/{post['id']}/like").status_code == 401


def test_like_is_idempotent_toggle(client):
    headers, _, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()
    base_likes = post["likes"]

    liked = client.post(f"/api/posts/{post['id']}/like", headers=headers).json()
    assert liked["likes"] == base_likes + 1
    assert liked["liked_by_me"] is True

    # Same user again -> toggles off, count returns to baseline (not inflated).
    again = client.post(f"/api/posts/{post['id']}/like", headers=headers).json()
    assert again["likes"] == base_likes
    assert again["liked_by_me"] is False


def test_liked_by_me_is_per_user(client):
    author, _, _ = register(client)
    other, _, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=author,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()
    client.post(f"/api/posts/{post['id']}/like", headers=author)

    # The author sees their like; a different user does not.
    as_author = next(
        p
        for p in client.get("/api/posts", headers=author).json()
        if p["id"] == post["id"]
    )
    as_other = next(
        p
        for p in client.get("/api/posts", headers=other).json()
        if p["id"] == post["id"]
    )
    assert as_author["liked_by_me"] is True
    assert as_other["liked_by_me"] is False


# --- Comments ------------------------------------------------------------


def test_comment_bumps_count(client):
    headers, _, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()

    res = client.post(
        f"/api/posts/{post['id']}/comments", headers=headers, json={"text": "Bien vu"}
    )
    assert res.status_code == 200, res.text

    refreshed = next(
        p for p in client.get("/api/posts").json() if p["id"] == post["id"]
    )
    assert refreshed["comments"] == post["comments"] + 1


def test_comment_requires_auth(client):
    headers, _, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()
    assert (
        client.post(
            f"/api/posts/{post['id']}/comments", json={"text": "no"}
        ).status_code
        == 401
    )


# --- Trip planner (geocode suggest + route scan) -------------------------


def test_geocode_suggest_gazetteer_fallback(client):
    # No GraphHopper key in tests -> gazetteer substring match.
    res = client.get("/api/geocode/suggest", params={"q": "plateau"})
    assert res.status_code == 200
    hits = res.json()
    assert any("plateau" in h["name"].lower() for h in hits)
    assert all({"name", "lat", "lng"} <= h.keys() for h in hits)


def test_geocode_suggest_parses_coordinates(client):
    res = client.get("/api/geocode/suggest", params={"q": "5.36,-4.0"})
    assert res.status_code == 200
    hits = res.json()
    assert hits and hits[0]["name"] == "Ma position"
    assert hits[0]["lat"] == 5.36 and hits[0]["lng"] == -4.0


def test_geocode_suggest_empty_query(client):
    assert client.get("/api/geocode/suggest", params={"q": ""}).json() == []


def test_scan_route_returns_comparison_fields(client):
    res = client.post("/api/route/scan", json={"from": "Cocody", "to": "Plateau"})
    assert res.status_code == 200, res.text
    body = res.json()
    # Direct route summary the comparison card relies on.
    assert "distance_km" in body and "duration_min" in body
    assert isinstance(body["alerts"], list)
    assert body["severe_count"] == sum(
        1 for a in body["alerts"] if a["severity"] in {"blocked", "danger"}
    )


def test_scan_route_accepts_gps_origin(client):
    # A "lat,lng" origin (from the browser's geolocation) resolves directly.
    res = client.post("/api/route/scan", json={"from": "5.36,-4.0", "to": "Plateau"})
    assert res.status_code == 200, res.text
    assert res.json()["from"]["name"] == "Ma position"


def test_road_conditions_returns_colored_segments(client):
    created = client.post(
        "/api/incidents",
        json={
            "type": "flood",
            "lat": 5.34,
            "lng": -4.0,
            "road": "Bd Test",
            "severity": "danger",
        },
    ).json()

    res = client.get("/api/road-conditions")
    assert res.status_code == 200, res.text
    segs = res.json()
    seg = next(s for s in segs if s["incident_id"] == created["id"])
    # Keyless: a straight straddle segment, coloured by the incident severity.
    assert seg["level"] == "danger"
    assert len(seg["coords"]) >= 2
    assert all(len(pt) == 2 for pt in seg["coords"])
