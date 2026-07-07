"""Unit tests for the contribution scoring (pure functions in gamification.py)."""

import gamification


def test_points_weights_posts_and_confirmations():
    assert gamification.points_for(0, 0) == 0
    assert gamification.points_for(3, 0) == 15
    assert gamification.points_for(0, 10) == 20
    assert gamification.points_for(3, 10) == 35


def test_tier_boundaries_are_inclusive():
    assert gamification.tier_for_points(0) == "Nouveau"
    assert gamification.tier_for_points(9) == "Nouveau"
    assert gamification.tier_for_points(10) == "Contributeur"
    assert gamification.tier_for_points(50) == "Voisin vigilant"
    assert gamification.tier_for_points(150) == "Contributeur Or"
    assert gamification.tier_for_points(400) == "Ambassadeur"
    assert gamification.tier_for_points(10_000) == "Ambassadeur"


def test_verified_only_top_tiers():
    assert gamification.is_verified("Contributeur Or")
    assert gamification.is_verified("Ambassadeur")
    assert not gamification.is_verified("Nouveau")
    assert not gamification.is_verified("Contributeur")


def test_next_tier_reports_gap():
    nxt = gamification.next_tier(0)
    assert nxt == {"label": "Contributeur", "at": 10, "points_needed": 10}
    nxt = gamification.next_tier(45)
    assert nxt == {"label": "Voisin vigilant", "at": 50, "points_needed": 5}


def test_next_tier_none_when_maxed():
    assert gamification.next_tier(400) is None
    assert gamification.next_tier(1_000) is None
