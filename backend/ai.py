"""AI itinerary recommendation.

Given the scanned route and the citizen incidents sitting on it, Claude writes
a short, human recommendation in French: is the road clear, worth caution, or
to be avoided — and why. Falls back to a deterministic rule-based summary when
no ANTHROPIC_API_KEY is configured, so the feature always returns something
useful.
"""

from __future__ import annotations

import json
import logging
import os
from typing import List, Optional

from dotenv import load_dotenv

import routing

logger = logging.getLogger(__name__)

# See routing.py: load backend/.env at import so the key is seen regardless of
# import order. override=False keeps test-set env vars authoritative.
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
# Fast, capable model for a short structured summary.
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-8")

_RECO_SCHEMA = {
    "type": "object",
    "properties": {
        "level": {"type": "string", "enum": ["clear", "caution", "avoid"]},
        "title": {"type": "string"},
        "message": {"type": "string"},
    },
    "required": ["level", "title", "message"],
    "additionalProperties": False,
}


def _rules_reco(alerts: List[dict], reroute: Optional[dict]) -> dict:
    """Deterministic fallback used when Claude isn't available."""
    severe = [a for a in alerts if a["severity"] in routing.SEVERE_SEVERITIES]
    if not alerts:
        return {
            "level": "clear",
            "title": "Voie libre",
            "message": "Aucun incident signalé sur ton trajet. Bonne route !",
            "source": "rules",
        }
    if severe:
        roads = ", ".join(sorted({a["road"] for a in severe})[:2])
        extra = ""
        if reroute and reroute.get("minutes_saved", 0) > 0:
            extra = f" Une déviation te ferait gagner ~{reroute['minutes_saved']} min."
        return {
            "level": "avoid",
            "title": f"{len(severe)} incident(s) majeur(s)",
            "message": f"Attention sur {roads}. Évite si possible.{extra}",
            "source": "rules",
        }
    total = sum(a["delay_min"] for a in alerts)
    return {
        "level": "caution",
        "title": f"{len(alerts)} alerte(s) sur le trajet",
        "message": f"Ralentissements probables, ~{total} min de retard cumulé. Reste prudent.",
        "source": "rules",
    }


async def recommend(
    origin: dict, dest: dict, alerts: List[dict], reroute: Optional[dict]
) -> dict:
    if not ANTHROPIC_KEY:
        return _rules_reco(alerts, reroute)
    try:
        import anthropic
    except ImportError:
        return _rules_reco(alerts, reroute)

    incidents_txt = (
        "\n".join(
            f"- {a['type']} ({a['severity']}) sur {a['road']}, {a['confirmed']} confirmations, "
            f"~{a['delay_min']} min de retard"
            for a in alerts
        )
        or "Aucun incident signalé."
    )
    reroute_txt = (
        f"Une déviation est disponible (gain estimé {reroute['minutes_saved']} min)."
        if reroute and reroute.get("minutes_saved", 0) > 0
        else "Pas de déviation utile."
    )
    prompt = (
        f"Itinéraire à Abidjan : de {origin['name']} vers {dest['name']}.\n"
        f"Incidents signalés par les citoyens sur ce trajet :\n{incidents_txt}\n"
        f"{reroute_txt}\n\n"
        "Donne une recommandation courte et concrète pour l'automobiliste, en français. "
        "level='clear' si rien de bloquant, 'caution' si ralentissements, "
        "'avoid' si danger/route coupée. title: 3-5 mots. message: 1-2 phrases, "
        "mentionne les rues et l'action conseillée (partir maintenant, contourner, reporter)."
    )
    try:
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_KEY)
        resp = await client.messages.create(
            model=MODEL,
            max_tokens=400,
            output_config={
                "format": {"type": "json_schema", "schema": _RECO_SCHEMA},
                "effort": "low",
            },
            messages=[{"role": "user", "content": prompt}],
        )
        text = next((b.text for b in resp.content if b.type == "text"), "")
        data = json.loads(text)
        return {
            "level": data["level"],
            "title": data["title"],
            "message": data["message"],
            "source": "ai",
        }
    except Exception:
        # Any API/parse failure: never break the scan, fall back to rules — but
        # log it, otherwise a misconfigured key or API change silently degrades
        # the "IA" recommendation to the rule-based one with no trace.
        logger.warning(
            "Claude recommendation failed; using rule-based fallback", exc_info=True
        )
        return _rules_reco(alerts, reroute)
