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

import math
import os
from typing import List, Optional, Tuple

import httpx
from dotenv import load_dotenv

# Load backend/.env before reading keys: server.py imports this module before
# its own load_dotenv runs, so we can't rely on the caller having loaded it.
# override=False keeps process env vars (e.g. those set by tests) authoritative.
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

GRAPHHOPPER_KEY = os.environ.get("GRAPHHOPPER_API_KEY", "")
GRAPHHOPPER_BASE = "https://graphhopper.com/api/1"

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


def _hit_label(hit: dict) -> str:
    """Human label for a GraphHopper geocode hit: 'Name, City' when useful."""
    name = hit.get("name") or ""
    city = hit.get("city") or ""
    if city and city != name:
        return f"{name}, {city}".strip(", ")
    return name


async def geocode(query: str, client: httpx.AsyncClient) -> dict:
    """Resolve a place name to {name, lat, lng}. Falls back to the gazetteer."""
    query = (query or "").strip()

    coords = parse_latlng(query)
    if coords:
        return {"name": "Ma position", "lat": coords[0], "lng": coords[1]}

    if GRAPHHOPPER_KEY:
        try:
            r = await client.get(
                f"{GRAPHHOPPER_BASE}/geocode",
                params={"q": query, "locale": "fr", "limit": 1, "key": GRAPHHOPPER_KEY},
                timeout=8.0,
            )
            r.raise_for_status()
            hits = r.json().get("hits") or []
            if hits:
                pt = hits[0]["point"]
                name = hits[0].get("name") or query
                return {"name": name or query, "lat": pt["lat"], "lng": pt["lng"]}
        except (httpx.HTTPError, KeyError, ValueError):
            pass  # fall through to the gazetteer

    lowered = query.lower()
    for key, (lat, lng) in ABIDJAN_GAZETTEER.items():
        if key in lowered:
            return {"name": query or key.title(), "lat": lat, "lng": lng}
    return {
        "name": query or "Abidjan",
        "lat": ABIDJAN_CENTER[0],
        "lng": ABIDJAN_CENTER[1],
    }


async def suggest(query: str, client: httpx.AsyncClient) -> List[dict]:
    """Address autocomplete: up to ~6 {name, lat, lng} candidates for a partial
    query. Uses GraphHopper when a key is set, otherwise the Abidjan gazetteer."""
    query = (query or "").strip()
    if not query:
        return []

    coords = parse_latlng(query)
    if coords:
        return [{"name": "Ma position", "lat": coords[0], "lng": coords[1]}]

    if GRAPHHOPPER_KEY:
        try:
            r = await client.get(
                f"{GRAPHHOPPER_BASE}/geocode",
                params={"q": query, "locale": "fr", "limit": 6, "key": GRAPHHOPPER_KEY},
                timeout=8.0,
            )
            r.raise_for_status()
            out = []
            for hit in r.json().get("hits") or []:
                pt = hit.get("point") or {}
                if "lat" in pt and "lng" in pt:
                    out.append(
                        {
                            "name": _hit_label(hit) or query,
                            "lat": pt["lat"],
                            "lng": pt["lng"],
                        }
                    )
            if out:
                return out
        except (httpx.HTTPError, KeyError, ValueError):
            pass  # fall through to the gazetteer

    lowered = query.lower()
    matches = [
        {"name": key.title(), "lat": lat, "lng": lng}
        for key, (lat, lng) in ABIDJAN_GAZETTEER.items()
        if lowered in key or key in lowered
    ]
    return matches[:6]


# --- Routing -------------------------------------------------------------


def _straight_line_route(a: dict, b: dict) -> dict:
    dist = haversine_m(a["lat"], a["lng"], b["lat"], b["lng"])
    return {
        "route": [[a["lng"], a["lat"]], [b["lng"], b["lat"]]],
        "distance_m": dist,
        "duration_min": dist / 1000.0 / FALLBACK_SPEED_KMH * 60.0,
    }


async def _graphhopper_route(
    points: List[dict], client: httpx.AsyncClient
) -> Optional[dict]:
    """Standard (contraction-hierarchies) route through the given waypoints.
    Works on GraphHopper's free plan — no flexible/custom-model mode."""
    body = {
        "profile": "car",
        "points": [[p["lng"], p["lat"]] for p in points],
        "points_encoded": False,
        "instructions": False,
    }
    try:
        r = await client.post(
            f"{GRAPHHOPPER_BASE}/route",
            params={"key": GRAPHHOPPER_KEY},
            json=body,
            timeout=12.0,
        )
        r.raise_for_status()
        paths = r.json().get("paths") or []
        if not paths:
            return None
        p = paths[0]
        coords = p.get("points", {}).get("coordinates") or []
        return {
            "route": coords,
            "distance_m": p["distance"],
            "duration_min": p["time"] / 60000.0,
        }
    except (httpx.HTTPError, KeyError, ValueError):
        return None


def _detour_waypoints(
    a: dict, b: dict, obstacle: dict, offset_m: float = 700.0
) -> List[dict]:
    """Two candidate via-points, offset perpendicular to the a→b line on either
    side of the obstacle, to push a standard route around it."""
    lat0 = obstacle["lat"]
    mpd_lat = 111320.0
    mpd_lng = 111320.0 * math.cos(math.radians(lat0)) or 1e-9
    d_east = (b["lng"] - a["lng"]) * mpd_lng
    d_north = (b["lat"] - a["lat"]) * mpd_lat
    norm = math.hypot(d_east, d_north) or 1e-9
    pe, pn = -d_north / norm, d_east / norm  # perpendicular unit vector
    vias = []
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
    if GRAPHHOPPER_KEY:
        gh = await _graphhopper_route([a, b], client)
        if gh:
            return gh
    return _straight_line_route(a, b)


async def compute_reroute(
    a: dict, b: dict, severe: List[dict], baseline: dict, client: httpx.AsyncClient
) -> Optional[dict]:
    """An alternative that steers around the severe incidents, if it helps.

    The free GraphHopper plan can't use custom-model area avoidance, so we route
    through a via-point offset to the side of the worst incident and keep the
    candidate that clears the most severe zones."""
    if not (GRAPHHOPPER_KEY and severe):
        return None

    obstacle = severe[0]  # first severe incident along the route
    best = None  # (severe_remaining, duration_min, alt)
    for via in _detour_waypoints(a, b, obstacle):
        alt = await _graphhopper_route([a, via, b], client)
        if not alt or len(alt["route"]) < 2:
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

    if not GRAPHHOPPER_KEY:
        return straight
    r = await _graphhopper_route([a, b], client)
    # Reject a big detour (snap points landed on different roads) — keep it tight.
    if r and len(r["route"]) >= 2 and r["distance_m"] <= 5 * span_m:
        return r["route"]
    return straight


async def road_conditions(incidents, client: httpx.AsyncClient) -> List[dict]:
    """One coloured road stretch per incident: {incident_id, road, level, coords}."""
    out = []
    for inc in incidents:
        coords = _ROAD_SEGMENT_CACHE.get(inc.id)
        if coords is None:
            coords = await road_segment_for_incident(inc, client)
            _ROAD_SEGMENT_CACHE[inc.id] = coords
        out.append(
            {
                "incident_id": inc.id,
                "road": inc.road,
                "level": inc.severity,
                "coords": coords,
            }
        )
    return out


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
