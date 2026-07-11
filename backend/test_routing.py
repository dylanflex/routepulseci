"""Tests for the route-scan geometry and incident correlation.

These cover the deterministic core of the "avant de partir" feature — the part
that decides which citizen incidents actually sit on a given itinerary — with
no external services required.
"""

import asyncio
import os
from datetime import datetime, timezone
from types import SimpleNamespace

import httpx

# Force every provider key off before importing routing so the provider chain
# stays offline here regardless of a local .env (routing loads it with
# override=False, so these process values win). Individual tests monkeypatch
# routing.GRAPHHOPPER_KEY when they want to exercise a provider path.
for _k in (
    "GRAPHHOPPER_API_KEY",
    "GEOAPIFY_API_KEY",
    "ORS_API_KEY",
    "LOCATIONIQ_API_KEY",
):
    os.environ[_k] = ""

import routing  # noqa: E402


def make_incident(
    id, lat, lng, type="jam", severity="dense", road="Rue X", confirmed=1
):
    return SimpleNamespace(
        id=id,
        lat=lat,
        lng=lng,
        type=type,
        severity=severity,
        road=road,
        confirmed=confirmed,
        created_at=datetime.now(timezone.utc),
    )


def test_haversine_known_distance():
    # ~1.11 km between two points 0.01deg of latitude apart.
    d = routing.haversine_m(5.36, -4.00, 5.37, -4.00)
    assert 1100 < d < 1120


def test_point_on_segment_is_near_zero():
    d = routing.point_to_segment_m(5.365, -4.00, 5.36, -4.00, 5.37, -4.00)
    assert d < 5


def test_point_off_segment_has_distance():
    # 0.01deg of longitude off the line ≈ 1.1 km at this latitude.
    d = routing.point_to_segment_m(5.365, -3.99, 5.36, -4.00, 5.37, -4.00)
    assert 1000 < d < 1300


def test_incidents_on_route_filters_by_corridor():
    route = [[-4.00, 5.36], [-4.00, 5.37]]  # [lng, lat] pairs
    on_route = make_incident("on", 5.365, -4.0005)  # ~55 m off the line
    off_route = make_incident("off", 5.365, -3.95)  # kilometres away
    result = routing.incidents_on_route([on_route, off_route], route, 1110.0)
    ids = [a["id"] for a in result]
    assert "on" in ids
    assert "off" not in ids


def test_incidents_on_route_orders_along_path_and_adds_delay():
    route = [[-4.00, 5.36], [-4.00, 5.38]]
    near_start = make_incident("a", 5.362, -4.0001, type="flood", severity="danger")
    near_end = make_incident("b", 5.378, -4.0001, type="jam", severity="dense")
    result = routing.incidents_on_route([near_end, near_start], route, 2220.0)
    assert [a["id"] for a in result] == ["a", "b"]  # ordered from origin
    assert result[0]["delay_min"] >= result[1]["delay_min"]  # flood/danger worse
    assert all("delay_min" in a and a["delay_min"] > 0 for a in result)


def test_incidents_on_route_includes_coordinates():
    # compute_reroute builds avoid-polygons from these dicts via inc["lat"]/["lng"],
    # so the correlation output must carry the coordinates.
    route = [[-4.00, 5.36], [-4.00, 5.37]]
    inc = make_incident("on", 5.365, -4.0005)
    (a,) = routing.incidents_on_route([inc], route, 1110.0)
    assert a["lat"] == inc.lat and a["lng"] == inc.lng


def test_straight_line_fallback_route():
    a = {"lat": 5.36, "lng": -4.00}
    b = {"lat": 5.37, "lng": -4.00}
    r = routing._straight_line_route(a, b)
    assert r["route"] == [[-4.00, 5.36], [-4.00, 5.37]]
    assert r["distance_m"] > 1000
    assert r["duration_min"] > 0


def test_extract_origin_destination_from_de_a_phrasing():
    assert routing.extract_origin_destination("de Cocody à Plateau") == (
        "cocody",
        "plateau",
    )


def test_extract_origin_destination_needs_two_places():
    # A single named place isn't enough to fire a route scan.
    assert routing.extract_origin_destination("comment ça se passe à Cocody ?") == (
        None,
        None,
    )
    assert routing.extract_origin_destination("bonjour") == (None, None)


def test_geocode_gazetteer_fallback_when_no_key(monkeypatch):
    monkeypatch.setattr(routing, "GRAPHHOPPER_KEY", "")
    got = asyncio.run(routing.geocode("Depuis le Plateau au bureau", client=None))
    assert got["name"]
    assert abs(got["lat"] - 5.3240) < 0.02  # resolved to Plateau


def test_reverse_geocode_gazetteer_fallback_when_no_provider(monkeypatch):
    # With every provider key off, a GPS fix still resolves to a place name via
    # nearest_commune rather than the literal "Ma position" or raw coordinates.
    monkeypatch.setattr(routing, "GRAPHHOPPER_KEY", "")
    routing._REVERSE_CACHE.clear()
    routing._PROVIDER_COOLDOWN.clear()
    got = asyncio.run(routing.reverse_geocode(5.36, -3.98, client=None))
    assert got["name"] == "Cocody"  # snapped to the nearest known district
    assert got["lat"] == 5.36 and got["lng"] == -3.98


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class _CountingClient:
    """Stands in for httpx.AsyncClient, counting real HTTP calls so a cache
    hit can be asserted by "the count didn't go up", not by mocking internals."""

    def __init__(self, payload):
        self.payload = payload
        self.calls = 0

    async def get(self, *args, **kwargs):
        self.calls += 1
        return _FakeResponse(self.payload)


def test_geocode_caches_by_normalized_query(monkeypatch):
    # Repeated identical queries (very common -- the same handful of Abidjan
    # place names get typed by many users/scans) must hit GraphHopper once,
    # not once per call, since that's the single largest avoidable chunk of
    # daily quota (see routing._GEOCODE_CACHE).
    monkeypatch.setattr(routing, "GRAPHHOPPER_KEY", "fake-key")
    routing._GEOCODE_CACHE.clear()
    routing._PROVIDER_COOLDOWN.clear()
    client = _CountingClient(
        {"hits": [{"name": "Cocody", "point": {"lat": 5.34, "lng": -3.98}}]}
    )

    first = asyncio.run(routing.geocode("Cocody", client))
    second = asyncio.run(routing.geocode("cocody", client))  # different case
    third = asyncio.run(routing.geocode(" Cocody ", client))  # different whitespace

    assert client.calls == 1
    assert first == second == third


def test_provider_chain_rotates_to_next_service_on_429(monkeypatch):
    # The whole point of the chain: when GraphHopper is quota-exhausted (429),
    # geocoding falls through to the next provider and parks GraphHopper on
    # cooldown instead of failing or dropping straight to the offline gazetteer.
    routing._GEOCODE_CACHE.clear()
    routing._PROVIDER_COOLDOWN.clear()
    monkeypatch.setattr(routing, "GRAPHHOPPER_KEY", "k1")
    monkeypatch.setattr(routing, "GEOAPIFY_KEY", "k2")
    monkeypatch.setattr(routing, "ORS_KEY", "")
    monkeypatch.setattr(routing, "LOCATIONIQ_KEY", "")

    req = httpx.Request("GET", "https://graphhopper.com")

    async def gh_429(key, query, client):
        raise httpx.HTTPStatusError(
            "quota", request=req, response=httpx.Response(429, request=req)
        )

    async def geoapify_ok(key, query, client):
        return {"name": "Cocody (geoapify)", "lat": 5.34, "lng": -3.98}

    monkeypatch.setattr(routing, "_gh_geocode", gh_429)
    monkeypatch.setattr(routing, "_geoapify_geocode", geoapify_ok)

    # client just needs to be non-None; the mocked adapters don't touch it.
    got = asyncio.run(routing.geocode("Cocody", client=object()))
    assert got["name"] == "Cocody (geoapify)"
    assert "graphhopper" in routing._PROVIDER_COOLDOWN  # parked after the 429


def test_provider_on_cooldown_is_skipped(monkeypatch):
    routing._GEOCODE_CACHE.clear()
    routing._PROVIDER_COOLDOWN.clear()
    monkeypatch.setattr(routing, "GRAPHHOPPER_KEY", "k1")
    monkeypatch.setattr(routing, "GEOAPIFY_KEY", "k2")
    monkeypatch.setattr(routing, "ORS_KEY", "")
    monkeypatch.setattr(routing, "LOCATIONIQ_KEY", "")
    routing._cooldown_provider("graphhopper")  # pretend it just 429'd

    called = {"gh": False}

    async def gh_should_not_run(key, query, client):
        called["gh"] = True
        return {"name": "nope", "lat": 5.0, "lng": -4.0}

    async def geoapify_ok(key, query, client):
        return {"name": "Cocody (geoapify)", "lat": 5.34, "lng": -3.98}

    monkeypatch.setattr(routing, "_gh_geocode", gh_should_not_run)
    monkeypatch.setattr(routing, "_geoapify_geocode", geoapify_ok)

    got = asyncio.run(routing.geocode("Cocody", client=object()))
    assert got["name"] == "Cocody (geoapify)"
    assert called["gh"] is False  # skipped while on cooldown


def test_suggest_caches_by_normalized_query(monkeypatch):
    monkeypatch.setattr(routing, "GRAPHHOPPER_KEY", "fake-key")
    routing._SUGGEST_CACHE.clear()
    routing._PROVIDER_COOLDOWN.clear()
    client = _CountingClient(
        {"hits": [{"name": "Plateau", "point": {"lat": 5.324, "lng": -4.024}}]}
    )

    first = asyncio.run(routing.suggest("Plateau", client))
    second = asyncio.run(routing.suggest("PLATEAU", client))

    assert client.calls == 1
    assert first == second
