"""Unit tests for the pure trust engine (trust.compute_trust)."""

import trust


def test_lone_fresh_unconfirmed_report_is_not_trusted():
    # The anti-spam case: a single severe-sounding claim nobody backs up must
    # not read as reliable no matter how fresh it is.
    result = trust.compute_trust(
        confirmed=0, age_minutes=1, corroborations=0, ttl_minutes=45
    )
    assert result["label"] in ("À confirmer", "Peu crédible")
    assert result["score"] < 50
    assert any("Pas encore confirmé" in r for r in result["reasons"])


def test_confirmations_raise_the_score():
    base = trust.compute_trust(0, 5, 0, ttl_minutes=180)["score"]
    more = trust.compute_trust(3, 5, 0, ttl_minutes=180)["score"]
    assert more > base


def test_corroboration_raises_the_score():
    base = trust.compute_trust(0, 5, 0, ttl_minutes=180)["score"]
    corrob = trust.compute_trust(0, 5, 3, ttl_minutes=180)["score"]
    assert corrob > base


def test_well_backed_fresh_report_is_very_reliable():
    result = trust.compute_trust(
        confirmed=3, age_minutes=2, corroborations=2, ttl_minutes=180
    )
    assert result["label"] == "Très fiable"
    assert result["score"] >= 75


def test_score_is_capped_at_100():
    result = trust.compute_trust(
        confirmed=50, age_minutes=0, corroborations=50, ttl_minutes=180
    )
    assert result["score"] == 100


def test_recency_decays_over_the_type_ttl():
    fresh = trust.compute_trust(1, 0, 0, ttl_minutes=100)["score"]
    stale = trust.compute_trust(1, 95, 0, ttl_minutes=100)["score"]
    assert fresh > stale


def test_ttl_scales_recency_by_type():
    # Same 40-min age reads as fresh for a long-lived pothole but stale for a
    # short-lived jam.
    jam = trust.compute_trust(0, 40, 0, ttl_minutes=45)["score"]
    pothole = trust.compute_trust(0, 40, 0, ttl_minutes=2880)["score"]
    assert pothole > jam


def test_reasons_are_explainable():
    result = trust.compute_trust(2, 1, 1, ttl_minutes=180)
    joined = " ".join(result["reasons"])
    assert "confirmation" in joined
    assert "indépendant" in joined


def test_zero_ttl_does_not_crash():
    result = trust.compute_trust(1, 10, 0, ttl_minutes=0)
    assert 0 <= result["score"] <= 100
