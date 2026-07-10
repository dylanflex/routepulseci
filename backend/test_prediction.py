"""Unit tests for the pure spatio-temporal risk forecaster (prediction.py)."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import prediction

# Cocody gazetteer point (routing.ABIDJAN_GAZETTEER) so nearest_commune resolves
# deterministically to "Cocody".
COCODY = (5.36, -3.98)
ABOBO = (5.42, -4.02)


def _inc(itype="jam", severity="dense", hour=8, days_ago=1, loc=COCODY):
    # A UTC timestamp at a chosen hour (Abidjan is UTC+0, so UTC hour == local).
    base = datetime.now(timezone.utc) - timedelta(days=days_ago)
    ts = base.replace(hour=hour, minute=0, second=0, microsecond=0)
    return SimpleNamespace(
        type=itype, lat=loc[0], lng=loc[1], severity=severity, created_at=ts
    )


def test_below_min_occurrences_is_not_forecast():
    # A single report is noise, not a pattern.
    out = prediction.forecast_risk([_inc()])
    assert out == []


def test_forecast_identifies_peak_window():
    # Four morning jams in Cocody -> peak window "Pointe du matin".
    incidents = [_inc(hour=7), _inc(hour=8), _inc(hour=8), _inc(hour=6)]
    out = prediction.forecast_risk(incidents)
    entry = next(f for f in out if f["commune"] == "Cocody" and f["type"] == "jam")
    assert entry["peak_window"] == "Pointe du matin"
    assert entry["occurrences"] == 4
    assert 0 <= entry["risk_score"] <= 100
    assert entry["confidence"] == "moyenne"  # 3..5 occurrences
    assert entry["reasons"]  # explainable


def test_higher_severity_and_frequency_scores_higher():
    floods = [_inc(itype="flood", severity="danger", loc=ABOBO) for _ in range(6)]
    jams = [_inc(itype="jam", severity="dense") for _ in range(2)]
    out = prediction.forecast_risk(floods + jams)
    flood = next(f for f in out if f["type"] == "flood")
    jam = next(f for f in out if f["type"] == "jam")
    assert flood["risk_score"] > jam["risk_score"]
    assert flood["confidence"] == "élevée"  # >= 6 occurrences
    # Sorted highest-risk first.
    assert out[0]["risk_score"] >= out[-1]["risk_score"]


def test_forecast_carries_richer_stats():
    incidents = [_inc(hour=7, severity="blocked") for _ in range(3)] + [
        _inc(hour=18, severity="danger")
    ]
    entry = prediction.forecast_risk(incidents)[0]
    # Full window distribution over all 5 buckets, shares summing to ~1.
    assert len(entry["window_distribution"]) == 5
    assert abs(sum(w["share"] for w in entry["window_distribution"]) - 1.0) < 0.2
    assert entry["dominant_severity"] == "blocked"
    assert entry["span_days"] >= 1
    assert "last_reported" in entry


def test_forecast_summary_rolls_up():
    floods = [_inc(itype="flood", severity="danger", loc=ABOBO) for _ in range(6)]
    jams = [_inc(itype="jam") for _ in range(3)]
    summary = prediction.forecast_summary(prediction.forecast_risk(floods + jams))
    assert summary["patterns"] == 2
    assert summary["high_risk"] >= 1
    assert summary["communes_covered"] == 2
    assert 0 <= summary["avg_score"] <= 100
    assert summary["top"]["type"] == "flood"


def test_forecast_summary_empty_is_safe():
    s = prediction.forecast_summary([])
    assert s["patterns"] == 0 and s["top"] is None


def test_naive_timestamps_are_handled():
    # SQLite hands back naive datetimes; the forecaster must not choke.
    naive = [
        SimpleNamespace(
            type="flood",
            lat=COCODY[0],
            lng=COCODY[1],
            severity="danger",
            created_at=datetime(2026, 7, 1, 8, 0, 0),  # naive, no tzinfo
        )
        for _ in range(3)
    ]
    out = prediction.forecast_risk(naive)
    assert out and out[0]["type"] == "flood"
