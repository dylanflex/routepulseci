"""Unit tests for the City Mobility Intelligence Score (intelligence.py)."""

from datetime import datetime, timezone
from types import SimpleNamespace

import intelligence

COCODY = (5.36, -3.98)
PLATEAU = (5.324, -4.018)


def _inc(itype="jam", severity="dense", loc=COCODY):
    return SimpleNamespace(
        type=itype,
        lat=loc[0],
        lng=loc[1],
        severity=severity,
        created_at=datetime.now(timezone.utc),
    )


def test_empty_city_is_perfectly_healthy():
    out = intelligence.city_mobility_score([])
    assert out["score"] == 100
    assert out["label"] == "Bonne"
    assert out["economic_estimate"]["cost_fcfa"] == 0
    assert out["commune_fluidity"] == []


def test_active_incidents_drag_the_score_down():
    incidents = (
        [_inc("jam", "blocked") for _ in range(4)]
        + [_inc("accident", "danger") for _ in range(2)]
        + [_inc("flood", "danger")]
    )
    out = intelligence.city_mobility_score(incidents)
    assert out["score"] < 100
    assert 0 <= out["score"] <= 100
    # Each sub-score stays clamped in range.
    for v in out["components"].values():
        assert 0 <= v <= 100
    assert out["components"]["securite"] < 100  # accidents hurt safety
    assert out["components"]["inondations"] < 100  # flood hurts floods score


def test_economic_estimate_is_positive_and_explained():
    out = intelligence.city_mobility_score([_inc("jam", "blocked") for _ in range(3)])
    est = out["economic_estimate"]
    assert est["hours_lost"] > 0
    assert est["cost_fcfa"] > 0
    assert est["fuel_liters"] > 0
    assert est["co2_kg"] > 0
    # Every figure ships with its assumptions (explainability).
    assert est["assumptions"]


def test_commune_fluidity_ranks_worst_first():
    incidents = [
        _inc("jam", "blocked", PLATEAU),
        _inc("jam", "blocked", PLATEAU),
        _inc("jam", "dense", COCODY),
    ]
    out = intelligence.city_mobility_score(incidents)
    communes = out["commune_fluidity"]
    assert communes[0]["fluidity"] <= communes[-1]["fluidity"]
    assert {c["commune"] for c in communes} == {"Plateau", "Cocody"}
