"""Incident trust engine.

Turns the raw signals an incident already carries — how many distinct users
confirmed it, how many *independent* nearby reports of the same type exist, and
how fresh it is relative to its type's lifetime — into a single 0-100 trust
score, a human label, and a list of plain-French reasons.

It is deliberately **pure and deterministic** (no ML, no API key): the whole
point is that the score a jury sees can be explained on the spot from inputs
they can verify, and that it degrades gracefully — an incident with no
corroboration simply reads "à confirmer" rather than being trusted by default.

This is the direct answer to "what stops someone spamming fake alerts?": a
lone, unconfirmed, uncorroborated report scores low no matter how severe it
claims to be, so the routing/reroute logic (which reads confirmations as its
trust signal) is never swung by a single unverified claim.

Incidents are anonymous by product decision (see server.IncidentORM), so unlike
a classic reputation engine this scores the *report*, not a contributor — the
signals available are all about corroboration, not who filed it.
"""

from __future__ import annotations

# Two same-type incidents within this distance are treated as independent
# corroboration of the same real-world event (see server.count_corroborations).
CORROBORATION_RADIUS_M = 300.0

# Score weights (sum of the caps + base = 100 at the ceiling).
_BASE_CREDIBILITY = 15  # every report that exists is worth a little.
_PER_CONFIRMATION = 15  # an explicit human vouch is the strongest signal.
_PER_CORROBORATION = 10  # an independent nearby report of the same type.
_CORROBORATION_CAP = 60  # confirmations + corroboration contribution, capped.
_RECENCY_MAX = 25  # a fresh report is more actionable than a stale one.

# Label thresholds.
_LABELS = (
    (75, "Très fiable"),
    (50, "Fiable"),
    (30, "À confirmer"),
    (0, "Peu crédible"),
)


def label_for_score(score: int) -> str:
    for threshold, label in _LABELS:
        if score >= threshold:
            return label
    return _LABELS[-1][1]


def compute_trust(
    confirmed: int,
    age_minutes: float,
    corroborations: int,
    ttl_minutes: float,
) -> dict:
    """Score one incident 0-100 with an explainable breakdown.

    - confirmed: distinct-user confirmations (server counts these idempotently).
    - age_minutes: minutes since the report was filed.
    - corroborations: OTHER same-type reports within CORROBORATION_RADIUS_M.
    - ttl_minutes: the incident type's lifetime (server.INCIDENT_TTL_MINUTES),
      used to scale recency so "fresh" means fresh *for this type* — a 40-min-old
      jam is stale, a 40-min-old pothole is not.
    """
    confirmed = max(0, confirmed)
    corroborations = max(0, corroborations)

    corroboration_pts = min(
        _CORROBORATION_CAP,
        confirmed * _PER_CONFIRMATION + corroborations * _PER_CORROBORATION,
    )

    # Recency decays linearly over the type's TTL: full weight when just filed,
    # ~0 as it nears expiry. Guard against a zero/absent TTL.
    if ttl_minutes and ttl_minutes > 0:
        recency_ratio = max(0.0, 1.0 - age_minutes / ttl_minutes)
    else:
        recency_ratio = 0.0
    recency_pts = round(_RECENCY_MAX * recency_ratio)

    score = int(min(100, _BASE_CREDIBILITY + corroboration_pts + recency_pts))

    reasons: list[str] = []
    if confirmed:
        reasons.append(
            f"{confirmed} confirmation{'s' if confirmed > 1 else ''} de la communauté"
        )
    if corroborations:
        reasons.append(
            f"{corroborations} signalement{'s' if corroborations > 1 else ''} "
            "indépendant(s) à proximité"
        )
    if not confirmed and not corroborations:
        reasons.append("Pas encore confirmé par d'autres usagers")
    if recency_ratio >= 0.6:
        reasons.append("Signalement récent")
    elif recency_ratio <= 0.15:
        reasons.append("Signalement ancien, proche de l'expiration")

    return {"score": score, "label": label_for_score(score), "reasons": reasons}
