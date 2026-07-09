"""Incident duplicate/merge clustering.

When N people report the same event ("un camion couché", a flood on the same
stretch), the DB holds N rows — incidents are never deleted (see server), so
"merging" here is a **read-time grouping**, not a destructive fold: same-type
reports within CLUSTER_RADIUS_M of each other are grouped into one logical
event so the UI can show "5 signalements groupés · 23 confirmations" instead of
five overlapping pins that each look like an independent incident.

Pure and deterministic (no key, unit-tested): grouping is exact connected
components over the "same type AND within radius" relation (union-find), so the
merge is transitive — A near B and B near C puts A, B, C in one cluster even if
A and C are just over the radius apart.

Operates on any object exposing .id/.type/.lat/.lng/.severity/.confirmed, so it
takes IncidentORM in the app and lightweight stand-ins in tests.
"""

from __future__ import annotations

from typing import Any, Collection

import routing

CLUSTER_RADIUS_M = 300.0

# Most-severe-wins ordering for a cluster's headline severity.
_SEVERITY_RANK = {"danger": 3, "blocked": 2, "dense": 1, "fluid": 0}


def _find(parent: list[int], x: int) -> int:
    while parent[x] != x:
        parent[x] = parent[parent[x]]  # path halving
        x = parent[x]
    return x


def cluster_incidents(
    incidents: Collection[Any], radius_m: float = CLUSTER_RADIUS_M
) -> list[dict]:
    """Group same-type incidents within radius_m into merged clusters.

    Returns one dict per cluster (including singletons), sorted by size then
    total confirmations, both descending — the busiest hotspots first.
    """
    items = list(incidents)
    n = len(items)
    parent = list(range(n))

    for i in range(n):
        for j in range(i + 1, n):
            if items[i].type != items[j].type:
                continue
            if _find(parent, i) == _find(parent, j):
                continue
            d = routing.haversine_m(
                items[i].lat, items[i].lng, items[j].lat, items[j].lng
            )
            if d <= radius_m:
                parent[_find(parent, i)] = _find(parent, j)

    groups: dict[int, list[Any]] = {}
    for idx, item in enumerate(items):
        groups.setdefault(_find(parent, idx), []).append(item)

    clusters: list[dict] = []
    for members in groups.values():
        # Representative = the most-confirmed member (tie-broken by id for
        # determinism) — the report the community has most vouched for.
        rep = max(members, key=lambda m: (m.confirmed, m.id))
        dominant_severity = max(
            (m.severity for m in members),
            key=lambda s: _SEVERITY_RANK.get(s, -1),
        )
        clusters.append(
            {
                "size": len(members),
                "type": rep.type,
                "representative_id": rep.id,
                "member_ids": [m.id for m in members],
                "total_confirmed": sum(m.confirmed for m in members),
                "severity": dominant_severity,
                "lat": sum(m.lat for m in members) / len(members),
                "lng": sum(m.lng for m in members) / len(members),
                "road": rep.road,
            }
        )

    clusters.sort(key=lambda c: (c["size"], c["total_confirmed"]), reverse=True)
    return clusters
