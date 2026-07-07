"""Contribution scoring — turns real activity into points, tiers and a ranking.

This is the engagement loop that fights RoutePulse's cold-start problem: a
signalling network is only useful once enough people report, so contributors
need a reason to keep coming back. Points and tiers give them visible standing
and a next goal, and the tier labels reuse the badge vocabulary already shown
in the feed — so earning a tier and wearing a badge are the same thing.

The functions here are pure and deterministic (unit-tested); the DB aggregation
that feeds them lives in server.py so this module stays import-cycle free.
"""

from __future__ import annotations

from typing import Optional

# A signalled post is worth more than a passive confirmation, but confirmations
# received are the community's trust in your reports, so they compound.
POINTS_PER_POST = 5
POINTS_PER_CONFIRMATION = 2

# Ordered low -> high: (min_points, label). Labels intentionally match the
# badges seeded in the feed (seed_data.USERS) so the two systems line up.
TIERS = [
    (0, "Nouveau"),
    (10, "Contributeur"),
    (50, "Voisin vigilant"),
    (150, "Contributeur Or"),
    (400, "Ambassadeur"),
]

# Tiers that earn the blue "verified" check in the feed.
VERIFIED_TIERS = {"Contributeur Or", "Ambassadeur"}


def points_for(posts: int, confirmations: int) -> int:
    """Total contribution points from a user's posts and confirmations received."""
    return posts * POINTS_PER_POST + confirmations * POINTS_PER_CONFIRMATION


def tier_for_points(points: int) -> str:
    """Highest tier label whose threshold the points reach."""
    label = TIERS[0][1]
    for threshold, name in TIERS:
        if points >= threshold:
            label = name
        else:
            break
    return label


def is_verified(tier: str) -> bool:
    return tier in VERIFIED_TIERS


def next_tier(points: int) -> Optional[dict]:
    """The next tier above the current points, or None once maxed out.

    {label, at (threshold), points_needed} — enough for the UI to render a
    "X points to <label>" progress bar.
    """
    for threshold, name in TIERS:
        if points < threshold:
            return {"label": name, "at": threshold, "points_needed": threshold - points}
    return None
