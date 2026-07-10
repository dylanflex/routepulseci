"""Route scanning for the "avant de partir" feature.

Turns a from/to request into a real itinerary, figures out which citizen
incidents actually sit on that itinerary, and (when a routing key is present)
computes an alternative that steers around the severe ones — floods and
blocked roads first, which is the whole point during the rainy season.

Everything degrades gracefully so the feature stays usable without keys:
  * No GRAPHHOPPER_API_KEY  -> straight-line route + a small built-in gazetteer
                              of Abidjan districts for geocoding.
  * A key present           -> real geocoding, real road geometry, real
                              avoid-area rerouting.

The geometry helpers (haversine, point-to-segment, corridor filtering) are
pure and deterministic — they carry the core value and are unit-tested.
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import time
from typing import Any, List, Optional, Tuple

import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load backend/.env before reading keys: server.py imports this module before
# its own load_dotenv runs, so we can't rely on the caller having loaded it.
# override=False keeps process env vars (e.g. those set by tests) authoritative.
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

GRAPHHOPPER_KEY = os.environ.get("GRAPHHOPPER_API_KEY", "")
GRAPHHOPPER_BASE = "https://graphhopper.com/api/1"

# Fallback geocoding/routing providers, tried in order AFTER GraphHopper when it
# 429s or fails (see the provider chain below). Keys come from .env; an empty
# key disables that provider. This is why a dead GraphHopper quota no longer
# kills "avant de partir" — the chain rotates to the next service, then to the
# offline gazetteer/straight-line as the final safety net.
GEOAPIFY_KEY = os.environ.get("GEOAPIFY_API_KEY", "")
ORS_KEY = os.environ.get("ORS_API_KEY", "")
LOCATIONIQ_KEY = os.environ.get("LOCATIONIQ_API_KEY", "")

# A provider that answers 402/403/429 (quota/forbidden) is parked for this long
# so we stop hammering it — and stop paying its latency — for the rest of the
# window instead of re-hitting it on every call.
PROVIDER_COOLDOWN_S = 900.0
_PROVIDER_COOLDOWN: dict[str, float] = {}

# Incidents within this distance of the route line count as "on your path".
CORRIDOR_BUFFER_M = 300.0
# Only these get an avoid-polygon — they're the ones worth a detour.
SEVERE_SEVERITIES = {"blocked", "danger"}
# Rough urban cruising speed used only for the keyless straight-line fallback.
FALLBACK_SPEED_KMH = 24.0

# Approximate delay (minutes) an incident adds, by type then severity.
DELAY_BY_TYPE = {
    "flood": 14,
    "accident": 12,
    "jam": 9,
    "works": 7,
    "degraded": 5,
    "police": 3,
}
DELAY_BY_SEVERITY = {"blocked": 12, "danger": 15, "dense": 6, "fluid": 2}

# Fallback geocoder: well-known Abidjan districts (lat, lng). Lets the demo
# resolve typical origins/destinations with no external geocoding service.
ABIDJAN_GAZETTEER = {
    "cocody": (5.3600, -3.9800),
    "riviera": (5.3560, -3.9500),
    "angre": (5.3900, -3.9850),
    "plateau": (5.3240, -4.0180),
    "yopougon": (5.3450, -4.0800),
    "marcory": (5.3000, -3.9900),
    "zone 4": (5.2950, -3.9850),
    "treichville": (5.2950, -4.0100),
    "adjame": (5.3550, -4.0250),
    "abobo": (5.4200, -4.0200),
    "koumassi": (5.2900, -3.9500),
    "port-bouet": (5.2600, -3.9300),
    "ccia": (5.3210, -4.0170),
    "palmeraie": (5.3700, -3.9600),
}
ABIDJAN_CENTER = (5.3600, -4.0083)

# RoutePulse is Abidjan-only. Bias geocoding toward the city and reject any hit
# outside Côte d'Ivoire — otherwise a generic name ("Plateau", "Marcory")
# matches a namesake abroad (GraphHopper ranks Benin's Plateau first for
# "Plateau"), producing an intercontinental route on which no citizen incident
# sits and no deviation can ever be proposed.
GEOCODE_BIAS_POINT = f"{ABIDJAN_CENTER[0]},{ABIDJAN_CENTER[1]}"
# (lat_min, lat_max, lng_min, lng_max) — a generous box around Côte d'Ivoire.
CI_BOUNDS = (4.0, 11.0, -8.8, -2.4)


def in_ci_bounds(lat: float, lng: float) -> bool:
    lat_min, lat_max, lng_min, lng_max = CI_BOUNDS
    return lat_min <= lat <= lat_max and lng_min <= lng <= lng_max


def nearest_commune(lat: float, lng: float) -> str:
    """Snap a point to the closest known Abidjan district. Incidents are only
    stored as raw lat/lng, so this is what lets the municipal dashboard
    (server.municipal_dashboard) aggregate "reports per commune" for a city/
    OSER partner without a dedicated commune column."""
    best_name, best_dist = None, float("inf")
    for name, (glat, glng) in ABIDJAN_GAZETTEER.items():
        d = haversine_m(lat, lng, glat, glng)
        if d < best_dist:
            best_dist, best_name = d, name
    return best_name.title() if best_name else "Abidjan"


# --- Geometry ------------------------------------------------------------


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _to_local_xy(lat: float, lng: float, lat0: float) -> Tuple[float, float]:
    """Equirectangular projection to metres, good enough at city scale."""
    r = 6371000.0
    x = math.radians(lng) * r * math.cos(math.radians(lat0))
    y = math.radians(lat) * r
    return x, y


def point_to_segment_m(
    plat: float, plng: float, alat: float, alng: float, blat: float, blng: float
) -> float:
    """Distance from point P to segment AB, in metres."""
    lat0 = (alat + blat) / 2
    px, py = _to_local_xy(plat, plng, lat0)
    ax, ay = _to_local_xy(alat, alng, lat0)
    bx, by = _to_local_xy(blat, blng, lat0)
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    if seg2 == 0.0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def distance_to_route_m(lat: float, lng: float, route: List[List[float]]) -> float:
    """Minimum distance from a point to a route polyline ([[lng, lat], ...])."""
    if not route:
        return float("inf")
    if len(route) == 1:
        return haversine_m(lat, lng, route[0][1], route[0][0])
    best = float("inf")
    for (alng, alat), (blng, blat) in zip(route, route[1:]):
        d = point_to_segment_m(lat, lng, alat, alng, blat, blng)
        if d < best:
            best = d
    return best


def incident_delay_min(itype: str, severity: str) -> int:
    return max(DELAY_BY_TYPE.get(itype, 5), DELAY_BY_SEVERITY.get(severity, 4))


# --- Geocoding -----------------------------------------------------------


def parse_latlng(query: str) -> Optional[Tuple[float, float]]:
    """Parse a "lat,lng" string (e.g. from the browser's geolocation) into
    coordinates, or None if it isn't one. Lets the frontend send a GPS fix as
    an origin without a reverse-geocoding round trip."""
    parts = (query or "").split(",")
    if len(parts) != 2:
        return None
    try:
        lat, lng = float(parts[0]), float(parts[1])
    except ValueError:
        return None
    if -90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0:
        return lat, lng
    return None


def extract_origin_destination(text: str) -> Tuple[Optional[str], Optional[str]]:
    """Deterministic origin/destination guess from a free-text question, using
    the Abidjan gazetteer — the keyless fallback for the copilot's route mode
    (ai.extract_route). Needs two distinct known districts; the earlier one in
    the sentence is taken as the origin ("de Cocody à Plateau"). Returns
    (None, None) when it can't find two, so the copilot stays in general mode
    rather than firing a GraphHopper scan on a guess."""
    low = (text or "").lower()
    hits: List[Tuple[int, str]] = []
    seen: set[str] = set()
    for place in ABIDJAN_GAZETTEER:
        pos = low.find(place)
        if pos != -1 and place not in seen:
            seen.add(place)
            hits.append((pos, place))
    if len(hits) < 2:
        return (None, None)
    hits.sort()
    return (hits[0][1], hits[1][1])


def _hit_label(hit: dict) -> str:
    """Human label for a GraphHopper geocode hit: 'Name, City' when useful."""
    name = hit.get("name") or ""
    city = hit.get("city") or ""
    if city and city != name:
        return f"{name}, {city}".strip(", ")
    return name


# --- Provider chain ------------------------------------------------------
#
# geocode / suggest / route each try the configured providers in order (see
# _providers), skipping any on cooldown, and only fall back to the offline
# gazetteer / straight line when every provider is unavailable. Each adapter
# returns the normalized shape ({name,lat,lng}, a list of those, or
# {route,distance_m,duration_min}) — or None when it simply has no result. The
# runner turns a 402/403/429 into a cooldown and moves on, and wraps every
# adapter so a single broken/absent provider can never break the chain.


def _flatten_line(geom: dict) -> list:
    """LineString / MultiLineString coordinates -> a flat [[lng,lat], ...]."""
    coords = geom.get("coordinates") or []
    if geom.get("type") == "MultiLineString":
        return [pt for seg in coords for pt in seg]
    return coords


# GraphHopper
async def _gh_geocode(key, query, client):
    r = await client.get(
        f"{GRAPHHOPPER_BASE}/geocode",
        params={
            "q": query,
            "locale": "fr",
            "limit": 5,
            "point": GEOCODE_BIAS_POINT,
            "location_bias_scale": 100,
            "key": key,
        },
        timeout=8.0,
    )
    r.raise_for_status()
    for hit in r.json().get("hits") or []:
        pt = hit.get("point") or {}
        if "lat" in pt and "lng" in pt and in_ci_bounds(pt["lat"], pt["lng"]):
            return {
                "name": hit.get("name") or query,
                "lat": pt["lat"],
                "lng": pt["lng"],
            }
    return None


async def _gh_suggest(key, query, client):
    r = await client.get(
        f"{GRAPHHOPPER_BASE}/geocode",
        params={
            "q": query,
            "locale": "fr",
            "limit": 10,
            "point": GEOCODE_BIAS_POINT,
            "location_bias_scale": 100,
            "key": key,
        },
        timeout=8.0,
    )
    r.raise_for_status()
    out = []
    for hit in r.json().get("hits") or []:
        pt = hit.get("point") or {}
        if "lat" in pt and "lng" in pt and in_ci_bounds(pt["lat"], pt["lng"]):
            out.append(
                {"name": _hit_label(hit) or query, "lat": pt["lat"], "lng": pt["lng"]}
            )
    return out[:6] or None


async def _gh_route(key, points, client):
    r = await client.post(
        f"{GRAPHHOPPER_BASE}/route",
        params={"key": key},
        json={
            "profile": "car",
            "points": [[p["lng"], p["lat"]] for p in points],
            "points_encoded": False,
            "instructions": False,
        },
        timeout=12.0,
    )
    r.raise_for_status()
    paths = r.json().get("paths") or []
    if not paths:
        return None
    p = paths[0]
    coords = p.get("points", {}).get("coordinates") or []
    if len(coords) < 2:
        return None
    return {
        "route": coords,
        "distance_m": p["distance"],
        "duration_min": p["time"] / 60000.0,
    }


# Geoapify
_GEOAPIFY = "https://api.geoapify.com/v1"
_BIAS = f"proximity:{ABIDJAN_CENTER[1]},{ABIDJAN_CENTER[0]}"


async def _geoapify_geocode(key, query, client):
    r = await client.get(
        f"{_GEOAPIFY}/geocode/search",
        params={
            "text": query,
            "lang": "fr",
            "limit": 5,
            "filter": "countrycode:ci",
            "bias": _BIAS,
            "apiKey": key,
        },
        timeout=8.0,
    )
    r.raise_for_status()
    for f in r.json().get("features") or []:
        pr = f.get("properties") or {}
        lat, lng = pr.get("lat"), pr.get("lon")
        if lat is not None and lng is not None and in_ci_bounds(lat, lng):
            return {"name": pr.get("formatted") or query, "lat": lat, "lng": lng}
    return None


async def _geoapify_suggest(key, query, client):
    r = await client.get(
        f"{_GEOAPIFY}/geocode/autocomplete",
        params={
            "text": query,
            "lang": "fr",
            "limit": 8,
            "filter": "countrycode:ci",
            "bias": _BIAS,
            "apiKey": key,
        },
        timeout=8.0,
    )
    r.raise_for_status()
    out = []
    for f in r.json().get("features") or []:
        pr = f.get("properties") or {}
        lat, lng = pr.get("lat"), pr.get("lon")
        if lat is not None and lng is not None and in_ci_bounds(lat, lng):
            out.append({"name": pr.get("formatted") or query, "lat": lat, "lng": lng})
    return out[:6] or None


async def _geoapify_route(key, points, client):
    wp = "|".join(f"{p['lat']},{p['lng']}" for p in points)
    r = await client.get(
        f"{_GEOAPIFY}/routing",
        params={"waypoints": wp, "mode": "drive", "apiKey": key},
        timeout=12.0,
    )
    r.raise_for_status()
    feats = r.json().get("features") or []
    if not feats:
        return None
    pr = feats[0].get("properties") or {}
    coords = _flatten_line(feats[0].get("geometry") or {})
    if len(coords) < 2:
        return None
    return {
        "route": coords,
        "distance_m": pr.get("distance", 0.0),
        "duration_min": pr.get("time", 0.0) / 60.0,
    }


# OpenRouteService
_ORS = "https://api.openrouteservice.org"


async def _ors_geocode(key, query, client):
    r = await client.get(
        f"{_ORS}/geocode/search",
        params={
            "api_key": key,
            "text": query,
            "boundary.country": "CIV",
            "size": 5,
            "focus.point.lon": ABIDJAN_CENTER[1],
            "focus.point.lat": ABIDJAN_CENTER[0],
        },
        timeout=8.0,
    )
    r.raise_for_status()
    for f in r.json().get("features") or []:
        c = (f.get("geometry") or {}).get("coordinates") or []
        if len(c) >= 2 and in_ci_bounds(c[1], c[0]):
            return {
                "name": (f.get("properties") or {}).get("label") or query,
                "lat": c[1],
                "lng": c[0],
            }
    return None


async def _ors_suggest(key, query, client):
    r = await client.get(
        f"{_ORS}/geocode/autocomplete",
        params={
            "api_key": key,
            "text": query,
            "boundary.country": "CIV",
            "focus.point.lon": ABIDJAN_CENTER[1],
            "focus.point.lat": ABIDJAN_CENTER[0],
        },
        timeout=8.0,
    )
    r.raise_for_status()
    out = []
    for f in r.json().get("features") or []:
        c = (f.get("geometry") or {}).get("coordinates") or []
        if len(c) >= 2 and in_ci_bounds(c[1], c[0]):
            out.append(
                {
                    "name": (f.get("properties") or {}).get("label") or query,
                    "lat": c[1],
                    "lng": c[0],
                }
            )
    return out[:6] or None


async def _ors_route(key, points, client):
    r = await client.post(
        f"{_ORS}/v2/directions/driving-car/geojson",
        headers={"Authorization": key, "Content-Type": "application/json"},
        json={"coordinates": [[p["lng"], p["lat"]] for p in points]},
        timeout=12.0,
    )
    r.raise_for_status()
    feats = r.json().get("features") or []
    if not feats:
        return None
    coords = (feats[0].get("geometry") or {}).get("coordinates") or []
    summ = (feats[0].get("properties") or {}).get("summary") or {}
    if len(coords) < 2:
        return None
    return {
        "route": coords,
        "distance_m": summ.get("distance", 0.0),
        "duration_min": summ.get("duration", 0.0) / 60.0,
    }


# LocationIQ
_LIQ = "https://us1.locationiq.com/v1"


async def _liq_geocode(key, query, client):
    r = await client.get(
        f"{_LIQ}/search",
        params={
            "key": key,
            "q": query,
            "format": "json",
            "limit": 5,
            "countrycodes": "ci",
            "accept-language": "fr",
        },
        timeout=8.0,
    )
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list):
        return None
    for it in data:
        lat, lng = float(it["lat"]), float(it["lon"])
        if in_ci_bounds(lat, lng):
            return {
                "name": (it.get("display_name") or query).split(",")[0],
                "lat": lat,
                "lng": lng,
            }
    return None


async def _liq_suggest(key, query, client):
    r = await client.get(
        f"{_LIQ}/autocomplete",
        params={
            "key": key,
            "q": query,
            "limit": 8,
            "countrycodes": "ci",
            "accept-language": "fr",
        },
        timeout=8.0,
    )
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list):
        return None
    out = []
    for it in data:
        lat, lng = float(it["lat"]), float(it["lon"])
        if in_ci_bounds(lat, lng):
            out.append(
                {
                    "name": (it.get("display_name") or query).split(",")[0],
                    "lat": lat,
                    "lng": lng,
                }
            )
    return out[:6] or None


async def _liq_route(key, points, client):
    path = ";".join(f"{p['lng']},{p['lat']}" for p in points)
    r = await client.get(
        f"{_LIQ}/directions/driving/{path}",
        params={"key": key, "overview": "full", "geometries": "geojson"},
        timeout=12.0,
    )
    r.raise_for_status()
    routes = r.json().get("routes") or []
    if not routes:
        return None
    coords = (routes[0].get("geometry") or {}).get("coordinates") or []
    if len(coords) < 2:
        return None
    return {
        "route": coords,
        "distance_m": routes[0].get("distance", 0.0),
        "duration_min": routes[0].get("duration", 0.0) / 60.0,
    }


def _provider_available(name: str) -> bool:
    return _PROVIDER_COOLDOWN.get(name, 0.0) <= time.monotonic()


def _cooldown_provider(name: str) -> None:
    _PROVIDER_COOLDOWN[name] = time.monotonic() + PROVIDER_COOLDOWN_S


def _providers() -> list:
    """Ordered provider table, rebuilt per call so monkeypatched keys (tests)
    and cooldown changes take effect immediately. GraphHopper stays first."""
    return [
        {
            "name": "graphhopper",
            "key": GRAPHHOPPER_KEY,
            "geocode": _gh_geocode,
            "suggest": _gh_suggest,
            "route": _gh_route,
        },
        {
            "name": "geoapify",
            "key": GEOAPIFY_KEY,
            "geocode": _geoapify_geocode,
            "suggest": _geoapify_suggest,
            "route": _geoapify_route,
        },
        {
            "name": "ors",
            "key": ORS_KEY,
            "geocode": _ors_geocode,
            "suggest": _ors_suggest,
            "route": _ors_route,
        },
        {
            "name": "locationiq",
            "key": LOCATIONIQ_KEY,
            "geocode": _liq_geocode,
            "suggest": _liq_suggest,
            "route": _liq_route,
        },
    ]


async def _run_chain(kind: str, *args, client) -> Any:
    """Try each configured, non-cooled provider's `kind` adapter in order;
    return the first non-empty result, or None so the caller can apply its
    offline fallback. A 402/403/429 cools the provider off."""
    if client is None:
        return None
    for p in _providers():
        fn = p.get(kind)
        if not (p["key"] and fn and _provider_available(p["name"])):
            continue
        try:
            result = await fn(p["key"], *args, client)
            if result:
                return result
        except httpx.HTTPStatusError as exc:
            code = exc.response.status_code
            if code in (402, 403, 429):
                logger.warning(
                    "%s: %s (quota) — cooldown %ds",
                    p["name"],
                    code,
                    int(PROVIDER_COOLDOWN_S),
                )
                _cooldown_provider(p["name"])
            else:
                logger.warning("%s: HTTP %s", p["name"], code)
        except Exception as exc:  # never let one provider break the chain
            logger.warning("%s failed: %s", p["name"], exc)
    return None


async def _route(points: List[dict], client: httpx.AsyncClient) -> Optional[dict]:
    """Provider-chain routing through the given waypoints (2 for a direct route,
    3 with a via-point for a detour). None when no provider could route."""
    return await _run_chain("route", points, client=client)


def _gazetteer_geocode(query: str) -> dict:
    """Offline geocode fallback: match the query against the Abidjan gazetteer,
    else the city centre. The final safety net when every provider is down."""
    lowered = (query or "").lower()
    for key, (lat, lng) in ABIDJAN_GAZETTEER.items():
        if key in lowered:
            return {"name": query or key.title(), "lat": lat, "lng": lng}
    return {
        "name": query or "Abidjan",
        "lat": ABIDJAN_CENTER[0],
        "lng": ABIDJAN_CENTER[1],
    }


# Place-name -> resolved location is effectively static (Abidjan streets don't
# move), so cache both lookups by normalized query text, same reasoning as
# _ROAD_SEGMENT_CACHE below. Without this, the same handful of common place
# names (Cocody, Plateau, Riviera, ...) typed by different users/route scans
# each cost their own GraphHopper call -- easily the largest avoidable chunk
# of daily quota, since geocode() alone is called twice per route scan (from
# + to) on top of whatever the autocomplete already spent on suggest().
# Process-lifetime cache; fine for a single instance (see _ROAD_SEGMENT_CACHE).
_GEOCODE_CACHE: dict[str, dict] = {}
_SUGGEST_CACHE: dict[str, List[dict]] = {}


async def geocode(query: str, client: httpx.AsyncClient) -> dict:
    """Resolve a place name to {name, lat, lng}. Falls back to the gazetteer."""
    query = (query or "").strip()

    coords = parse_latlng(query)
    if coords:
        return {"name": "Ma position", "lat": coords[0], "lng": coords[1]}

    cache_key = query.lower()
    cached = _GEOCODE_CACHE.get(cache_key)
    if cached is not None:
        return cached

    # Try each provider in turn (GraphHopper → Geoapify → ORS → LocationIQ),
    # then the offline gazetteer. Result cached so the same place name never
    # costs a second lookup this process lifetime.
    result = await _run_chain("geocode", query, client=client)
    if result is None:
        result = _gazetteer_geocode(query)

    _GEOCODE_CACHE[cache_key] = result
    return result


async def suggest(query: str, client: httpx.AsyncClient) -> List[dict]:
    """Address autocomplete: up to ~6 {name, lat, lng} candidates for a partial
    query. Uses GraphHopper when a key is set, otherwise the Abidjan gazetteer."""
    query = (query or "").strip()
    if not query:
        return []

    coords = parse_latlng(query)
    if coords:
        return [{"name": "Ma position", "lat": coords[0], "lng": coords[1]}]

    cache_key = query.lower()
    cached = _SUGGEST_CACHE.get(cache_key)
    if cached is not None:
        return cached

    result = await _run_chain("suggest", query, client=client)
    if result is None:
        lowered = query.lower()
        result = [
            {"name": key.title(), "lat": lat, "lng": lng}
            for key, (lat, lng) in ABIDJAN_GAZETTEER.items()
            if lowered in key or key in lowered
        ][:6]

    _SUGGEST_CACHE[cache_key] = result
    return result


# --- Routing -------------------------------------------------------------


def _straight_line_route(a: dict, b: dict) -> dict:
    dist = haversine_m(a["lat"], a["lng"], b["lat"], b["lng"])
    return {
        "route": [[a["lng"], a["lat"]], [b["lng"], b["lat"]]],
        "distance_m": dist,
        "duration_min": dist / 1000.0 / FALLBACK_SPEED_KMH * 60.0,
    }


# Perpendicular offsets (metres) tried on each side of the obstacle. A single
# small nudge often snaps straight back onto the blocked road; wider offsets
# force the router onto a genuinely different corridor.
DETOUR_OFFSETS_M = (900.0, 1800.0, 3000.0)


def _detour_waypoints(a: dict, b: dict, obstacle: dict) -> List[dict]:
    """Candidate via-points offset perpendicular to the a→b line, on both sides
    of the obstacle and across several distances (DETOUR_OFFSETS_M)."""
    lat0 = obstacle["lat"]
    mpd_lat = 111320.0
    mpd_lng = 111320.0 * math.cos(math.radians(lat0)) or 1e-9
    d_east = (b["lng"] - a["lng"]) * mpd_lng
    d_north = (b["lat"] - a["lat"]) * mpd_lat
    norm = math.hypot(d_east, d_north) or 1e-9
    pe, pn = -d_north / norm, d_east / norm  # perpendicular unit vector
    vias = []
    for offset_m in DETOUR_OFFSETS_M:
        for sign in (1.0, -1.0):
            vias.append(
                {
                    "lat": obstacle["lat"] + sign * pn * offset_m / mpd_lat,
                    "lng": obstacle["lng"] + sign * pe * offset_m / mpd_lng,
                }
            )
    return vias


def _count_severe_on_route(route: List[List[float]], severe: List[dict]) -> int:
    return sum(
        1
        for inc in severe
        if distance_to_route_m(inc["lat"], inc["lng"], route) <= CORRIDOR_BUFFER_M
    )


async def compute_route(a: dict, b: dict, client: httpx.AsyncClient) -> dict:
    res = await _route([a, b], client)
    return res or _straight_line_route(a, b)


async def compute_reroute(
    a: dict, b: dict, severe: List[dict], baseline: dict, client: httpx.AsyncClient
) -> Optional[dict]:
    """An alternative that steers around the severe incidents, if it helps.

    Free routing plans can't use custom-model area avoidance, so we route
    through a via-point offset to the side of the worst incident and keep the
    candidate that clears the most severe zones."""
    if not severe:
        return None

    obstacle = severe[0]  # first severe incident along the route
    baseline_dist = baseline.get("distance_m") or 0.0
    vias = _detour_waypoints(a, b, obstacle)
    # Evaluate all detour candidates concurrently rather than serially — the
    # wider search would otherwise stack several round trips onto every scan.
    alts = await asyncio.gather(*(_route([a, via, b], client) for via in vias))
    best = None  # (severe_remaining, duration_min, alt)
    for alt in alts:
        if not alt or len(alt["route"]) < 2:
            continue
        # Reject an absurd detour (a via-point snapped onto a distant road).
        if baseline_dist and alt["distance_m"] > 3.0 * baseline_dist:
            continue
        remaining = _count_severe_on_route(alt["route"], severe)
        key = (remaining, alt["duration_min"])
        if best is None or key < (best[0], best[1]):
            best = (remaining, alt["duration_min"], alt)

    # Only surface a deviation that actually clears at least one severe zone.
    if best is None or best[0] >= len(severe):
        return None

    alt = best[2]
    saved = round(baseline["duration_min"] - alt["duration_min"])
    return {
        "route": alt["route"],
        "distance_km": round(alt["distance_m"] / 1000.0, 1),
        "duration_min": round(alt["duration_min"]),
        "minutes_saved": saved,
    }


# --- Road conditions -----------------------------------------------------

# Real road geometry near an incident is stable (incidents don't move), so we
# cache the snapped stretch by incident id to avoid re-hitting GraphHopper on
# every map refresh. Process-lifetime cache; fine for a single instance.
_ROAD_SEGMENT_CACHE: dict = {}


async def road_segment_for_incident(
    inc, client: httpx.AsyncClient, span_m: float = 180.0
) -> List[List[float]]:
    """A real road polyline straddling the incident. Two points offset along the
    bearing to the city centre are snapped to the road network by GraphHopper;
    the route between them traces the actual street. Falls back to a short
    straight straddle when keyless or on failure/oversized detour."""
    lat, lng = inc.lat, inc.lng
    clat, clng = ABIDJAN_CENTER
    mpd_lat = 111320.0
    mpd_lng = 111320.0 * math.cos(math.radians(lat)) or 1e-9
    de = (clng - lng) * mpd_lng
    dn = (clat - lat) * mpd_lat
    norm = math.hypot(de, dn) or 1e-9
    ue, un = de / norm, dn / norm
    a = {"lat": lat + un * span_m / mpd_lat, "lng": lng + ue * span_m / mpd_lng}
    b = {"lat": lat - un * span_m / mpd_lat, "lng": lng - ue * span_m / mpd_lng}
    straight = [[a["lng"], a["lat"]], [lng, lat], [b["lng"], b["lat"]]]

    r = await _route([a, b], client)
    # Reject a big detour (snap points landed on different roads) — keep it tight.
    if r and len(r["route"]) >= 2 and r["distance_m"] <= 5 * span_m:
        return r["route"]
    return straight


async def _resolve_segment(inc, client: httpx.AsyncClient) -> List[List[float]]:
    coords = _ROAD_SEGMENT_CACHE.get(inc.id)
    if coords is None:
        coords = await road_segment_for_incident(inc, client)
        _ROAD_SEGMENT_CACHE[inc.id] = coords
    return coords


async def road_conditions(incidents, client: httpx.AsyncClient) -> List[dict]:
    """One coloured road stretch per incident: {incident_id, road, level, coords}.

    Cache misses hit GraphHopper, so resolve them concurrently — this endpoint
    is polled with the live map and a sequential loop over N incidents would
    stack N round trips on the first (cold-cache) load.
    """
    segments = await asyncio.gather(
        *(_resolve_segment(inc, client) for inc in incidents)
    )
    return [
        {
            "incident_id": inc.id,
            "road": inc.road,
            "level": inc.severity,
            "coords": coords,
        }
        for inc, coords in zip(incidents, segments)
    ]


# --- Correlation ---------------------------------------------------------


def incidents_on_route(
    incidents, route: List[List[float]], route_len_m: float
) -> List[dict]:
    """Keep incidents inside the route corridor, ordered along the way."""
    on_path = []
    origin = route[0] if route else None
    for inc in incidents:
        d = distance_to_route_m(inc.lat, inc.lng, route)
        if d <= CORRIDOR_BUFFER_M:
            along = (
                haversine_m(origin[1], origin[0], inc.lat, inc.lng) if origin else 0.0
            )
            on_path.append(
                {
                    "id": inc.id,
                    "type": inc.type,
                    "severity": inc.severity,
                    "road": inc.road,
                    # lat/lng are needed to build avoid-polygons in compute_reroute.
                    "lat": inc.lat,
                    "lng": inc.lng,
                    "confirmed": inc.confirmed,
                    "created_at": inc.created_at,
                    "distance_m": round(d),
                    "delay_min": incident_delay_min(inc.type, inc.severity),
                    "_along": along,
                }
            )
    on_path.sort(key=lambda x: x["_along"])
    for x in on_path:
        x.pop("_along", None)
    return on_path
