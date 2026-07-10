"""RoutePulse Mobility Intelligence Score.

The flagship data product: a single daily read on a city's mobility health,
computed from the collected incidents. Turns "a map that shows traffic" into
"a platform that measures, explains and prices a city's mobility" — the number
a mayor publishes, an insurer prices against, a jury remembers.

Two honesty rules make it defensible in a Q&A:
  1. The **health sub-scores** (fluidité/sécurité/inondations/infrastructure)
     are computed directly from the currently-active incidents — verifiable.
  2. The **economic figures** (hours lost, cost, fuel, CO2) are explicitly
     *estimates* from stated coefficients (`ASSUMPTIONS`), not measured trip
     data we don't collect. Every figure ships with the formula/coefficient,
     so it can be defended and re-tuned on the spot — same spirit as the
     prediction engine: a transparent estimator, never a black box.

Pure and deterministic (unit-tested like prediction.py / trust.py). Operates on
any object exposing .type/.lat/.lng/.severity/.created_at.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Collection, Optional

import routing

# --- Economic estimate coefficients (illustrative, stated, tunable) ---------
# Deliberately conservative round numbers; the point is a transparent model,
# not a false precision. Shown in the UI so a partner can plug in real values.
VEHICLES_PER_ACTIVE_INCIDENT = 50  # road users caught in a typical active event
AVG_OCCUPANCY = 1.5  # people per vehicle
HOURLY_VALUE_FCFA = 1500  # average value of an hour lost (FCFA)
IDLE_FUEL_L_PER_H = 1.5  # fuel burned idling per vehicle-hour (litres)
CO2_KG_PER_L = 2.31  # CO2 per litre of fuel burned (kg)

ASSUMPTIONS = [
    f"{VEHICLES_PER_ACTIVE_INCIDENT} usagers impactés par incident actif",
    f"Occupation moyenne : {AVG_OCCUPANCY} pers./véhicule",
    f"Valeur d'une heure perdue : {HOURLY_VALUE_FCFA} FCFA",
    f"Sur-consommation à l'arrêt : {IDLE_FUEL_L_PER_H} L/h · {CO2_KG_PER_L} kg CO₂/L",
]

# How much each active incident type/severity presses on the health sub-scores.
_JAM_TYPES = {"jam", "works"}
_SEVERITY_DRAG = {"danger": 3.0, "blocked": 2.0, "dense": 1.0, "fluid": 0.4}

# Soft-saturation half-pressure per sub-score: the "pressure" (summed severity
# weights of active incidents) at which the sub-score falls to 50/100. Larger =
# more tolerant. A soft curve (100·K/(K+pressure)) is used instead of a linear
# penalty so a congested city degrades smoothly toward — but never floors at —
# zero, keeping the score informative under heavy load.
_HALF_PRESSURE = {
    "fluidite": 35.0,
    "securite": 25.0,
    "inondations": 18.0,
    "infrastructure": 40.0,
    "commune": 9.0,
}


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _label(score: int) -> str:
    return "Bonne" if score >= 75 else "Tendue" if score >= 50 else "Critique"


def city_mobility_score(
    active_incidents: Collection[Any], now: Optional[datetime] = None
) -> dict:
    """Compute the city mobility score + economic estimate from the currently
    **active** incidents (the caller applies the TTL filter, so this scores the
    live situation). Returns the composite 0-100 score, its sub-scores, the
    per-commune fluidity ranking, and the explainable economic estimate."""
    now = now or datetime.now(timezone.utc)
    incidents = list(active_incidents)

    jams = [i for i in incidents if i.type in _JAM_TYPES]
    accidents = [i for i in incidents if i.type == "accident"]
    floods = [i for i in incidents if i.type == "flood"]
    degraded = [i for i in incidents if i.type == "degraded"]

    def pressure(group: list) -> float:
        return sum(_SEVERITY_DRAG.get(i.severity, 1.0) for i in group)

    def health(group: list, key: str) -> int:
        k = _HALF_PRESSURE[key]
        return round(_clamp(100.0 * k / (k + pressure(group))))

    fluidite = health(jams, "fluidite")
    securite = health(accidents, "securite")
    inondations = health(floods, "inondations")
    infrastructure = health(degraded, "infrastructure")

    score = round(
        0.40 * fluidite + 0.30 * securite + 0.20 * inondations + 0.10 * infrastructure
    )

    # Economic estimate — transparent model over active incidents.
    hours_lost = sum(
        routing.incident_delay_min(i.type, i.severity)
        / 60.0
        * VEHICLES_PER_ACTIVE_INCIDENT
        for i in incidents
    )
    cost_fcfa = hours_lost * AVG_OCCUPANCY * HOURLY_VALUE_FCFA
    fuel_liters = hours_lost * IDLE_FUEL_L_PER_H
    co2_kg = fuel_liters * CO2_KG_PER_L

    # Per-commune fluidity (worst first) — the media-friendly index + ranking.
    by_commune: dict[str, list] = {}
    for i in incidents:
        by_commune.setdefault(routing.nearest_commune(i.lat, i.lng), []).append(i)
    commune_fluidity: list[dict[str, Any]] = [
        {
            "commune": commune,
            "fluidity": health(group, "commune"),
            "active_incidents": len(group),
        }
        for commune, group in by_commune.items()
    ]
    commune_fluidity.sort(key=lambda c: c["fluidity"])

    return {
        "score": score,
        "label": _label(score),
        "components": {
            "fluidite": fluidite,
            "securite": securite,
            "inondations": inondations,
            "infrastructure": infrastructure,
        },
        "active_incidents": len(incidents),
        "economic_estimate": {
            "hours_lost": round(hours_lost),
            "cost_fcfa": round(cost_fcfa),
            "fuel_liters": round(fuel_liters),
            "co2_kg": round(co2_kg),
            "assumptions": ASSUMPTIONS,
        },
        "commune_fluidity": commune_fluidity,
        "updated_at": now.isoformat(),
    }
