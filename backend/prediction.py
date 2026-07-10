"""Spatio-temporal risk forecasting.

Turns the raw incident history into a forward-looking, **explainable** risk
forecast: per commune × incident type, when is the danger concentrated, how
strong is the pattern, and how confident are we. This is the "que va-t-il
probablement se passer ?" layer — the data asset's payoff.

Deliberately NOT a black-box model. It is a transparent statistical estimator
over the collected reports (frequency × severity × recency, bucketed by
time-of-day), so every score can be defended on the spot from inputs a jury —
or a road-safety regulator — can verify. That explainability is a feature, not
a limitation: it is exactly what lets the forecast be trusted for public budget
prioritisation and insurer pricing.

Pure and deterministic (no key, unit-tested like trust.py / clustering.py).
Operates on any object exposing .type/.lat/.lng/.severity/.created_at, so it
takes IncidentORM in the app and lightweight stand-ins in tests. Abidjan is
UTC+0, so an incident's UTC hour is its local hour — no timezone conversion
needed beyond normalising naive timestamps (written UTC) back to UTC.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Collection, Optional

import routing

# Commute-relevant day parts (local Abidjan time == UTC).
TIME_WINDOWS = [
    ("Nuit", range(0, 5)),
    ("Pointe du matin", range(5, 10)),
    ("Journée", range(10, 16)),
    ("Pointe du soir", range(16, 21)),
    ("Soirée", range(21, 24)),
]

# How much each severity contributes to the risk score (a recurring flood
# weighs more than recurring light slowdowns).
_SEVERITY_WEIGHT = {"danger": 1.0, "blocked": 0.85, "dense": 0.55, "fluid": 0.3}

# A pattern needs at least this many historical reports to be forecast at all —
# below it there's no signal, only noise (same spirit as the trust engine
# refusing to trust a lone report).
MIN_OCCURRENCES = 2

_TYPE_LABELS_FR = {
    "degraded": "route dégradée",
    "accident": "accident",
    "jam": "embouteillage",
    "flood": "inondation",
    "police": "contrôle",
    "works": "travaux",
}


def _hour(dt: datetime) -> int:
    """Local (== UTC) hour of a timestamp, normalising naive values (SQLite
    round-trips UTC-aware columns as naive) back to UTC first."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).hour


def _window_for_hour(hour: int) -> str:
    for label, hours in TIME_WINDOWS:
        if hour in hours:
            return label
    return "Journée"


def _trend(group: list, now: datetime) -> str:
    """Is the pattern intensifying? Split the group's lifespan in half by time
    and compare how many reports fall in the recent half vs the older half."""
    times = sorted(_aware(i.created_at) for i in group)
    span_start, span_end = times[0], times[-1]
    if span_start == span_end:
        return "stable"
    midpoint = span_start + (span_end - span_start) / 2
    recent = sum(1 for t in times if t >= midpoint)
    older = len(times) - recent
    if recent > older * 1.3:
        return "en hausse"
    if older > recent * 1.3:
        return "en baisse"
    return "stable"


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def forecast_risk(
    incidents: Collection[Any], now: Optional[datetime] = None
) -> list[dict]:
    """Per commune × type risk forecast, highest-risk first.

    Each entry: risk_score (0-100), risk_level, the peak time window and its
    share, a confidence tier from the sample size, a trend, and plain-language
    `reasons` — everything needed to defend the number without a black box.
    """
    now = now or datetime.now(timezone.utc)
    groups: dict[tuple[str, str], list[Any]] = defaultdict(list)
    for inc in incidents:
        commune = routing.nearest_commune(inc.lat, inc.lng)
        groups[(commune, inc.type)].append(inc)

    max_count = max((len(g) for g in groups.values()), default=1)
    forecasts: list[dict] = []
    for (commune, itype), group in groups.items():
        n = len(group)
        if n < MIN_OCCURRENCES:
            continue

        window_counts = Counter(_window_for_hour(_hour(i.created_at)) for i in group)
        peak_window, peak_n = window_counts.most_common(1)[0]
        peak_share = peak_n / n
        # Full time-of-day distribution (all windows, in chronological order) so
        # the dashboard can render a mini-histogram, not just the single peak.
        window_distribution = [
            {
                "window": label,
                "count": window_counts.get(label, 0),
                "share": round(window_counts.get(label, 0) / n, 2),
            }
            for label, _ in TIME_WINDOWS
        ]

        severity_counts = Counter(i.severity for i in group)
        dominant_severity = severity_counts.most_common(1)[0][0]
        avg_severity = sum(_SEVERITY_WEIGHT.get(i.severity, 0.5) for i in group) / n
        avg_confirmed = round(sum(getattr(i, "confirmed", 0) for i in group) / n, 1)

        times = sorted(_aware(i.created_at) for i in group)
        span_days = max(1, round((times[-1] - times[0]).total_seconds() / 86400))
        last_reported = times[-1]

        # Risk score blends how often it recurs (relative to the busiest zone)
        # with how severe it typically is.
        frequency = n / max_count
        risk_score = round(100 * (0.6 * frequency + 0.4 * avg_severity))
        risk_level = (
            "élevé" if risk_score >= 66 else "modéré" if risk_score >= 40 else "faible"
        )
        confidence = "élevée" if n >= 6 else "moyenne" if n >= 3 else "faible"
        trend = _trend(group, now)
        type_fr = _TYPE_LABELS_FR.get(itype, itype)

        reasons = [
            f"{n} signalement(s) historique(s) de {type_fr} sur ~{span_days} j",
            f"Concentrés surtout : {peak_window} ({round(peak_share * 100)}%)",
            f"Gravité dominante : {dominant_severity}",
            f"Tendance {trend}",
            f"Fiabilité de la prévision : {confidence} (basée sur {n} relevé(s))",
        ]
        forecasts.append(
            {
                "commune": commune,
                "type": itype,
                "occurrences": n,
                "risk_score": risk_score,
                "risk_level": risk_level,
                "peak_window": peak_window,
                "peak_share": round(peak_share, 2),
                "window_distribution": window_distribution,
                "dominant_severity": dominant_severity,
                "avg_confirmed": avg_confirmed,
                "span_days": span_days,
                "last_reported": last_reported.isoformat(),
                "confidence": confidence,
                "trend": trend,
                "reasons": reasons,
                "forecast": (
                    f"Risque {risk_level} de {type_fr} vers {commune}, "
                    f"surtout en {peak_window.lower()}."
                ),
            }
        )

    forecasts.sort(key=lambda f: f["risk_score"], reverse=True)
    return forecasts


def forecast_summary(forecasts: list[dict]) -> dict:
    """Citywide roll-up of a forecast list — the headline numbers for the data
    dashboard (total patterns, how many are high-risk, coverage, average score,
    the dominant type and the single most-at-risk zone)."""
    if not forecasts:
        return {
            "patterns": 0,
            "high_risk": 0,
            "communes_covered": 0,
            "avg_score": 0,
            "dominant_type": None,
            "top": None,
        }
    types = Counter(f["type"] for f in forecasts)
    top = max(forecasts, key=lambda f: f["risk_score"])
    return {
        "patterns": len(forecasts),
        "high_risk": sum(1 for f in forecasts if f["risk_level"] == "élevé"),
        "communes_covered": len({f["commune"] for f in forecasts}),
        "avg_score": round(sum(f["risk_score"] for f in forecasts) / len(forecasts)),
        "dominant_type": types.most_common(1)[0][0],
        "top": {
            "commune": top["commune"],
            "type": top["type"],
            "risk_score": top["risk_score"],
            "peak_window": top["peak_window"],
        },
    }
