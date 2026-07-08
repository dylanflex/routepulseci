"""Tests for the route-scan geometry and incident correlation.

These cover the deterministic core of the "avant de partir" feature — the part
that decides which citizen incidents actually sit on a given itinerary — with
no external services required.
"""

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import routing


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


def test_geocode_gazetteer_fallback_when_no_key(monkeypatch):
    monkeypatch.setattr(routing, "GRAPHHOPPER_KEY", "")
    got = asyncio.run(routing.geocode("Depuis le Plateau au bureau", client=None))
    assert got["name"]
    assert abs(got["lat"] - 5.3240) < 0.02  # resolved to Plateau


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
    client = _CountingClient(
        {"hits": [{"name": "Cocody", "point": {"lat": 5.34, "lng": -3.98}}]}
    )

    first = asyncio.run(routing.geocode("Cocody", client))
    second = asyncio.run(routing.geocode("cocody", client))  # different case
    third = asyncio.run(routing.geocode(" Cocody ", client))  # different whitespace

    assert client.calls == 1
    assert first == second == third


def test_suggest_caches_by_normalized_query(monkeypatch):
    monkeypatch.setattr(routing, "GRAPHHOPPER_KEY", "fake-key")
    routing._SUGGEST_CACHE.clear()
    client = _CountingClient(
        {"hits": [{"name": "Plateau", "point": {"lat": 5.324, "lng": -4.024}}]}
    )

    first = asyncio.run(routing.suggest("Plateau", client))
    second = asyncio.run(routing.suggest("PLATEAU", client))

    assert client.calls == 1
    assert first == second
