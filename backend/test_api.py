"""End-to-end tests for the RoutePulse HTTP API.

Runs the real FastAPI app against a throwaway SQLite file (set via
DATABASE_URL before `server` is imported, since the engine is built at import
time). The lifespan handler creates the schema and seeds demo rows, so these
tests exercise the same wiring the app uses in production.

Each test mints a unique username so the module-shared database stays free of
cross-test collisions (pytest.ini pins a module to a single xdist worker).
"""

import asyncio
import os
import tempfile
import uuid
from datetime import datetime, timedelta, timezone

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


def _create_incident(client, **overrides):
    payload = {
        "type": "accident",
        "lat": 5.32,
        "lng": -4.01,
        "road": "Bd X",
        "severity": "blocked",
        **overrides,
    }
    return client.post("/api/incidents", json=payload).json()


def _backdate_incident(incident_id: str, minutes_ago: float) -> None:
    """Rewrite an incident's created_at directly in the DB, to test TTL
    expiry without waiting for real time to pass."""

    async def _do():
        async with server.SessionLocal() as session:
            incident = await session.get(server.IncidentORM, incident_id)
            incident.created_at = datetime.now(timezone.utc) - timedelta(
                minutes=minutes_ago
            )
            await session.commit()

    asyncio.run(_do())


def test_create_incident_starts_unconfirmed(client):
    # A fresh report is a claim, not yet a validated fact — see server.py's
    # IncidentORM.confirmed comment for why this must not default to 1.
    created = _create_incident(client)
    assert created["confirmed"] == 0
    assert created["confirmed_by_me"] is False


def test_incident_transport_modes_default_to_voiture(client):
    created = _create_incident(client)
    assert created["transport_modes"] == ["voiture"]


def test_incident_transport_modes_can_be_multiple(client):
    payload = {
        "type": "flood",
        "lat": 5.32,
        "lng": -4.01,
        "road": "Bd X",
        "severity": "danger",
        "transport_modes": ["gbaka", "woro_woro", "pied"],
    }
    created = client.post("/api/incidents", json=payload).json()
    assert created["transport_modes"] == ["gbaka", "woro_woro", "pied"]

    # Round-trips correctly through GET too, not just the create response.
    fetched = next(
        i for i in client.get("/api/incidents").json() if i["id"] == created["id"]
    )
    assert fetched["transport_modes"] == ["gbaka", "woro_woro", "pied"]


def test_confirm_incident_requires_auth(client):
    incident = _create_incident(client)
    res = client.post(f"/api/incidents/{incident['id']}/confirm")
    assert res.status_code == 401


def test_confirm_incident_is_idempotent_toggle(client):
    headers, _, _ = register(client)
    incident = _create_incident(client)
    before = incident["confirmed"]

    confirmed = client.post(
        f"/api/incidents/{incident['id']}/confirm", headers=headers
    ).json()
    assert confirmed["confirmed"] == before + 1
    assert confirmed["confirmed_by_me"] is True

    # Same user again -> toggles off, no unlimited replay inflation.
    again = client.post(
        f"/api/incidents/{incident['id']}/confirm", headers=headers
    ).json()
    assert again["confirmed"] == before
    assert again["confirmed_by_me"] is False


def test_confirmed_by_me_is_per_user_for_incidents(client):
    author, _, _ = register(client)
    other, _, _ = register(client)
    incident = _create_incident(client)
    client.post(f"/api/incidents/{incident['id']}/confirm", headers=author)

    as_author = next(
        i
        for i in client.get("/api/incidents", headers=author).json()
        if i["id"] == incident["id"]
    )
    as_other = next(
        i
        for i in client.get("/api/incidents", headers=other).json()
        if i["id"] == incident["id"]
    )
    assert as_author["confirmed_by_me"] is True
    assert as_other["confirmed_by_me"] is False


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


def test_incident_expires_off_the_map_after_its_type_ttl(client):
    # A jam's TTL is 45 min (server.INCIDENT_TTL_MINUTES) -- push it well past
    # that and it must disappear from the live list, road conditions, stats'
    # active count, and the route-scan corridor, with nothing to undo it (no
    # resolve/delete endpoint exists).
    incident = _create_incident(client, type="jam")
    _backdate_incident(incident["id"], minutes_ago=200)

    ids = [i["id"] for i in client.get("/api/incidents").json()]
    assert incident["id"] not in ids


def test_incident_within_ttl_still_shows(client):
    incident = _create_incident(client, type="flood")  # 12h TTL
    _backdate_incident(incident["id"], minutes_ago=60)

    ids = [i["id"] for i in client.get("/api/incidents").json()]
    assert incident["id"] in ids


def test_expired_incident_excluded_from_road_conditions_and_stats(client):
    before_stats = client.get("/api/stats").json()
    incident = _create_incident(client, type="jam")
    _backdate_incident(incident["id"], minutes_ago=200)

    segments = client.get("/api/road-conditions").json()
    assert all(incident["id"] != s.get("incident_id") for s in segments)

    after_stats = client.get("/api/stats").json()
    # The expired incident must not have bumped the active count, even though
    # it was counted at creation time before being backdated.
    assert after_stats["activeAlerts"] == before_stats["activeAlerts"]


def test_expired_incident_excluded_from_route_scan(client):
    incident = _create_incident(
        client, type="accident", lat=5.34, lng=-4.0, road="Bd Test", severity="danger"
    )
    _backdate_incident(incident["id"], minutes_ago=400)  # accident TTL is 3h

    res = client.post("/api/route/scan", json={"from": "Cocody", "to": "Plateau"})
    alert_ids = [a.get("id") for a in res.json()["alerts"]]
    assert incident["id"] not in alert_ids


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


def test_post_transport_modes_default_and_custom(client):
    headers, _, _ = register(client)
    default_post = client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()
    assert default_post["transport_modes"] == ["voiture"]

    custom_post = client.post(
        "/api/posts",
        headers=headers,
        json={
            "location": "L",
            "type": "jam",
            "severity": "dense",
            "text": "x",
            "transport_modes": ["gbaka", "moto"],
        },
    ).json()
    assert custom_post["transport_modes"] == ["gbaka", "moto"]


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


def test_comment_is_attributed_to_the_author_account(client):
    # A comment must be traceable to a real account (moderation, not just a
    # free-text display name) — see CommentORM.user_id.
    headers, user, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()
    comment = client.post(
        f"/api/posts/{post['id']}/comments", headers=headers, json={"text": "Bien vu"}
    ).json()
    assert comment["user_id"] == user["id"]


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


def test_comment_like_is_idempotent_toggle(client):
    headers, _, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()
    comment = client.post(
        f"/api/posts/{post['id']}/comments", headers=headers, json={"text": "Bien vu"}
    ).json()
    assert comment["likes"] == 0
    assert comment["liked_by_me"] is False

    liked = client.post(f"/api/comments/{comment['id']}/like", headers=headers).json()
    assert liked["likes"] == 1
    assert liked["liked_by_me"] is True

    again = client.post(f"/api/comments/{comment['id']}/like", headers=headers).json()
    assert again["likes"] == 0
    assert again["liked_by_me"] is False


def test_comment_like_requires_auth(client):
    headers, _, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()
    comment = client.post(
        f"/api/posts/{post['id']}/comments", headers=headers, json={"text": "x"}
    ).json()
    assert client.post(f"/api/comments/{comment['id']}/like").status_code == 401


def test_comment_reply_is_linked_to_parent(client):
    headers, _, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()
    parent = client.post(
        f"/api/posts/{post['id']}/comments",
        headers=headers,
        json={"text": "Question ?"},
    ).json()
    reply = client.post(
        f"/api/posts/{post['id']}/comments",
        headers=headers,
        json={"text": "Réponse.", "parent_comment_id": parent["id"]},
    ).json()
    assert reply["parent_comment_id"] == parent["id"]

    comments = client.get(f"/api/posts/{post['id']}/comments").json()
    assert any(
        c["id"] == reply["id"] and c["parent_comment_id"] == parent["id"]
        for c in comments
    )


def test_comment_reply_rejects_parent_from_another_post(client):
    headers, _, _ = register(client)
    post_a = client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "a"},
    ).json()
    post_b = client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "b"},
    ).json()
    parent = client.post(
        f"/api/posts/{post_a['id']}/comments", headers=headers, json={"text": "x"}
    ).json()
    res = client.post(
        f"/api/posts/{post_b['id']}/comments",
        headers=headers,
        json={"text": "y", "parent_comment_id": parent["id"]},
    )
    assert res.status_code == 400


# --- Post reports (moderation signal) -------------------------------------


def test_report_post_requires_auth(client):
    headers, _, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()
    assert client.post(f"/api/posts/{post['id']}/report").status_code == 401


def test_report_post_is_repeatable_without_error(client):
    author, _, _ = register(client)
    reporter, _, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=author,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()
    # Unlike like/confirm, reporting isn't a toggle -- clicking twice must not
    # error or flip any state back, just stay reported.
    first = client.post(f"/api/posts/{post['id']}/report", headers=reporter)
    second = client.post(f"/api/posts/{post['id']}/report", headers=reporter)
    assert first.status_code == 200 and first.json() == {"reported": True}
    assert second.status_code == 200 and second.json() == {"reported": True}


def _admin_headers(client):
    login = client.post(
        "/api/auth/login",
        json={"username": "moderateur", "password": "routepulse-demo"},
    )
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_post_auto_hides_after_report_threshold(client):
    author, _, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=author,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "spam?"},
    ).json()

    # server.REPORT_HIDE_THRESHOLD reports from distinct users -- one short
    # of it must leave the post visible in the feed.
    for _ in range(server.REPORT_HIDE_THRESHOLD - 1):
        reporter, _, _ = register(client)
        client.post(f"/api/posts/{post['id']}/report", headers=reporter)
    assert post["id"] in [p["id"] for p in client.get("/api/posts").json()]

    last_reporter, _, _ = register(client)
    client.post(f"/api/posts/{post['id']}/report", headers=last_reporter)
    assert post["id"] not in [p["id"] for p in client.get("/api/posts").json()]


def test_moderation_queue_requires_admin(client):
    headers, _, _ = register(client)
    assert client.get("/api/admin/moderation").status_code == 401
    assert client.get("/api/admin/moderation", headers=headers).status_code == 403
    assert (
        client.get("/api/admin/moderation", headers=_admin_headers(client)).status_code
        == 200
    )


def test_moderation_queue_lists_reported_posts_and_unhide_restores_them(client):
    author, _, _ = register(client)
    post = client.post(
        "/api/posts",
        headers=author,
        json={
            "location": "L",
            "type": "jam",
            "severity": "dense",
            "text": "faux signalement ?",
        },
    ).json()
    for _ in range(server.REPORT_HIDE_THRESHOLD):
        reporter, _, _ = register(client)
        client.post(f"/api/posts/{post['id']}/report", headers=reporter)

    admin = _admin_headers(client)
    queue = client.get("/api/admin/moderation", headers=admin).json()
    entry = next(e for e in queue if e["id"] == post["id"])
    assert entry["report_count"] >= server.REPORT_HIDE_THRESHOLD
    assert entry["hidden"] is True

    res = client.post(f"/api/admin/moderation/{post['id']}/unhide", headers=admin)
    assert res.status_code == 200, res.text
    assert post["id"] in [p["id"] for p in client.get("/api/posts").json()]

    # A non-admin can't override a moderator's decision.
    headers, _, _ = register(client)
    assert (
        client.post(
            f"/api/admin/moderation/{post['id']}/unhide", headers=headers
        ).status_code
        == 403
    )


# --- Settings (privacy / notifications) -----------------------------------


def test_update_settings_requires_auth(client):
    assert (
        client.patch("/api/me/settings", json={"show_real_name": False}).status_code
        == 401
    )


def test_privacy_setting_anonymizes_author_for_other_viewers_only(client):
    author, author_user, author_username = register(client, display_name="Privacy Test")
    other, _, _ = register(client)

    updated = client.patch(
        "/api/me/settings", headers=author, json={"show_real_name": False}
    ).json()
    assert updated["show_real_name"] is False

    post = client.post(
        "/api/posts",
        headers=author,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    ).json()
    # The author still sees their own real name/handle on their own post...
    assert post["author"]["handle"] == f"@{author_username}"

    # ...but another viewer, and an anonymous one, see it anonymized.
    as_other = next(
        p
        for p in client.get("/api/posts", headers=other).json()
        if p["id"] == post["id"]
    )
    as_anon = next(p for p in client.get("/api/posts").json() if p["id"] == post["id"])
    assert as_other["author"]["handle"] == "@anonyme"
    assert as_anon["author"]["handle"] == "@anonyme"


def test_notify_nearby_incidents_setting_persists(client):
    headers, _, _ = register(client)
    assert (
        client.get("/api/auth/me", headers=headers).json()["notify_nearby_incidents"]
        is True
    )
    updated = client.patch(
        "/api/me/settings", headers=headers, json={"notify_nearby_incidents": False}
    ).json()
    assert updated["notify_nearby_incidents"] is False
    assert (
        client.get("/api/auth/me", headers=headers).json()["notify_nearby_incidents"]
        is False
    )


# --- Favorite zones --------------------------------------------------------


def test_favorite_zones_require_auth(client):
    assert client.get("/api/me/favorite-zones").status_code == 401
    assert (
        client.post(
            "/api/me/favorite-zones", json={"name": "Cocody", "lat": 5.3, "lng": -4.0}
        ).status_code
        == 401
    )


def test_favorite_zones_crud(client):
    headers, _, _ = register(client)
    assert client.get("/api/me/favorite-zones", headers=headers).json() == []

    zone = client.post(
        "/api/me/favorite-zones",
        headers=headers,
        json={"name": "Cocody Angré", "lat": 5.38, "lng": -3.99},
    ).json()
    assert zone["name"] == "Cocody Angré"

    zones = client.get("/api/me/favorite-zones", headers=headers).json()
    assert [z["id"] for z in zones] == [zone["id"]]

    assert (
        client.delete(
            f"/api/me/favorite-zones/{zone['id']}", headers=headers
        ).status_code
        == 204
    )
    assert client.get("/api/me/favorite-zones", headers=headers).json() == []


def test_favorite_zone_delete_is_scoped_to_owner(client):
    owner, _, _ = register(client)
    other, _, _ = register(client)
    zone = client.post(
        "/api/me/favorite-zones",
        headers=owner,
        json={"name": "Marcory", "lat": 5.29, "lng": -3.98},
    ).json()
    res = client.delete(f"/api/me/favorite-zones/{zone['id']}", headers=other)
    assert res.status_code == 404
    # Untouched: still there for the real owner.
    assert len(client.get("/api/me/favorite-zones", headers=owner).json()) == 1


# --- Community ranking (gamification) ------------------------------------


def test_me_stats_requires_auth(client):
    assert client.get("/api/me/stats").status_code == 401


def test_me_stats_reflects_posts_and_tier(client):
    headers, _, _ = register(client)

    # Fresh account: no posts -> zero points, entry tier.
    stats = client.get("/api/me/stats", headers=headers).json()
    assert stats["points"] == 0
    assert stats["tier"] == "Nouveau"
    assert stats["next_tier"]["label"] == "Contributeur"

    # One post, no confirmations yet (a fresh post starts unvalidated) = 5 pts.
    client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    )
    stats = client.get("/api/me/stats", headers=headers).json()
    assert stats["posts"] == 1
    assert stats["confirmations"] == 0
    assert stats["points"] == 5
    assert stats["next_tier"]["points_needed"] == 5


def test_leaderboard_ranks_new_author(client):
    headers, user, _ = register(client, display_name="Ranked User")
    client.post(
        "/api/posts",
        headers=headers,
        json={"location": "L", "type": "jam", "severity": "dense", "text": "x"},
    )
    board = client.get("/api/leaderboard", params={"limit": 50}).json()
    mine = [e for e in board if e["handle"] == f"@{user['username']}"]
    assert len(mine) == 1
    assert mine[0]["posts"] == 1
    assert mine[0]["points"] >= 5
    assert "rank" in mine[0] and "tier" in mine[0]


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


# --- Historical risk zones -------------------------------------------------


def test_risk_zone_requires_minimum_occurrences(client):
    road = f"Rue Test {uuid.uuid4().hex[:8]}"
    for _ in range(2):
        _create_incident(client, type="flood", road=road)
    zones = client.get("/api/risk-zones").json()
    assert not any(z["road"] == road for z in zones)

    # A 3rd report of the same (road, type) crosses the threshold.
    _create_incident(client, type="flood", road=road)
    zones = client.get("/api/risk-zones").json()
    zone = next(z for z in zones if z["road"] == road)
    assert zone["type"] == "flood"
    assert zone["occurrences"] == 3


def test_risk_zone_counts_expired_incidents_too(client):
    # A recurring pattern must still show even if every individual report has
    # long since aged off the live map (server.is_incident_active) -- that's
    # the whole point: a pattern the live map alone can't convey.
    road = f"Rue Test {uuid.uuid4().hex[:8]}"
    ids = []
    for _ in range(3):
        incident = _create_incident(client, type="degraded", road=road)
        _backdate_incident(incident["id"], minutes_ago=10000)  # past pothole TTL
        ids.append(incident["id"])

    live_ids = [i["id"] for i in client.get("/api/incidents").json()]
    assert not any(i in live_ids for i in ids)

    zones = client.get("/api/risk-zones").json()
    zone = next(z for z in zones if z["road"] == road)
    assert zone["occurrences"] == 3


def test_scan_route_surfaces_historical_risk_zones_on_corridor(client):
    road = f"Rue Test {uuid.uuid4().hex[:8]}"
    # A point on the Cocody -> Plateau straight-line fallback route (no
    # GraphHopper key in tests), so it lands inside the scanned corridor.
    for _ in range(3):
        incident = _create_incident(
            client, type="flood", road=road, lat=5.342, lng=-3.999, severity="danger"
        )
        _backdate_incident(incident["id"], minutes_ago=5000)  # past flood TTL

    res = client.post("/api/route/scan", json={"from": "Cocody", "to": "Plateau"})
    zones = res.json()["historical_risk_zones"]
    assert any(z["road"] == road for z in zones)


# --- Municipal dashboard (B2G) ----------------------------------------------


def test_municipal_dashboard_groups_reports_by_commune(client):
    road = f"Rue Test {uuid.uuid4().hex[:8]}"
    # (5.36, -3.98) is the Cocody gazetteer point (routing.ABIDJAN_GAZETTEER).
    _create_incident(client, type="jam", road=road, lat=5.36, lng=-3.98)

    dashboard = client.get("/api/admin/dashboard").json()
    cocody = next(c for c in dashboard["communes"] if c["commune"] == "Cocody")
    assert cocody["total_reports"] >= 1
    assert cocody["active_incidents"] >= 1
    assert cocody["top_type"] is not None
    assert dashboard["citywide"]["total_reports"] >= 1


def test_municipal_dashboard_counts_risk_zones_per_commune(client):
    road = f"Rue Test {uuid.uuid4().hex[:8]}"
    for _ in range(3):
        # (5.42, -4.02) is the Abobo gazetteer point.
        _create_incident(client, type="flood", road=road, lat=5.42, lng=-4.02)

    dashboard = client.get("/api/admin/dashboard").json()
    abobo = next(c for c in dashboard["communes"] if c["commune"] == "Abobo")
    assert abobo["risk_zones"] >= 1
    assert dashboard["citywide"]["risk_zones"] >= 1
