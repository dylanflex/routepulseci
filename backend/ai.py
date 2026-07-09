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

# The incident taxonomy the classifier must map free text onto. Kept in sync
# with the frontend INCIDENT_TYPES / TRAFFIC_LEVELS and server's Severity enum.
INCIDENT_TYPES = ("degraded", "accident", "jam", "flood", "police", "works")
SEVERITIES = ("fluid", "dense", "blocked", "danger")

_CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": list(INCIDENT_TYPES)},
        "severity": {"type": "string", "enum": list(SEVERITIES)},
        "confidence": {"type": "number"},
    },
    "required": ["type", "severity", "confidence"],
    "additionalProperties": False,
}

# Keyword fallback (used with no ANTHROPIC_API_KEY). French + Abidjan slang.
# Order matters only for readability; scoring counts matches per type.
_TYPE_KEYWORDS = {
    "flood": (
        "inond",
        "eau",
        "pluie",
        "submerg",
        "crue",
        "déborde",
        "flaque",
    ),
    "accident": (
        "accident",
        "collision",
        "couché",
        "renvers",
        "choc",
        "percut",
        "carambol",
        "tôle",
        "blessé",
        "mort",
    ),
    "police": ("police", "contrôle", "barrage", "gendarme", "flic", "corps habillé"),
    "works": ("travaux", "chantier", "déviation", "bitume", "goudron"),
    "degraded": (
        "nid de poule",
        "nid-de-poule",
        "trou",
        "dégrad",
        "abîm",
        "crevasse",
        "cassé",
    ),
    "jam": (
        "bouchon",
        "embouteillage",
        "trafic",
        "ralenti",
        "circulation",
        "coincé",
        "avance pas",
        "gbaka",
    ),
}

_SEVERITY_KEYWORDS = {
    "danger": ("danger", "grave", "mort", "blessé", "inond", "effondr", "urgent"),
    "blocked": (
        "bloqu",
        "coupé",
        "fermé",
        "impossible",
        "arrêt",
        "couché",
        "immobilis",
    ),
    "dense": ("ralenti", "lent", "dense", "difficile", "saturé", "chargé"),
}


def _rules_classify(text: str) -> dict:
    """Deterministic keyword classifier — the keyless fallback. Never guesses
    blindly: unmatched text defaults to a low-confidence generic jam so the UI
    can present it as a *suggestion* the reporter confirms, not a fact."""
    lowered = (text or "").lower()

    type_scores = {
        itype: sum(1 for kw in kws if kw in lowered)
        for itype, kws in _TYPE_KEYWORDS.items()
    }
    best_type = max(type_scores, key=lambda t: type_scores[t])
    matched = type_scores[best_type] > 0

    severity = "dense"
    for sev, kws in _SEVERITY_KEYWORDS.items():
        if any(kw in lowered for kw in kws):
            severity = sev
            break

    return {
        "type": best_type if matched else "jam",
        "severity": severity,
        # Keyword matches are a decent hint but never as sure as the model;
        # cap confidence so the UI keeps framing it as a suggestion.
        "confidence": 0.6 if matched else 0.3,
        "source": "rules",
    }


async def classify_incident_text(text: str) -> dict:
    """Map a free-text incident description to {type, severity, confidence}.
    Claude when a key is set, keyword rules otherwise — same graceful-degrade
    contract as recommend()."""
    if not (text or "").strip():
        return {
            "type": "jam",
            "severity": "dense",
            "confidence": 0.0,
            "source": "rules",
        }
    if not ANTHROPIC_KEY:
        return _rules_classify(text)
    try:
        import anthropic
    except ImportError:
        return _rules_classify(text)

    prompt = (
        "Un usager à Abidjan décrit un incident routier :\n"
        f'"{text}"\n\n'
        "Classe-le. type: degraded (nid de poule/route dégradée), accident, "
        "jam (embouteillage), flood (inondation), police (contrôle), works "
        "(travaux). severity: fluid, dense (ralentissements), blocked (voie "
        "bloquée/coupée), danger (risque grave, inondation, accident corporel). "
        "confidence: 0 à 1, ta certitude."
    )
    try:
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_KEY)
        resp = await client.messages.create(
            model=MODEL,
            max_tokens=200,
            output_config={
                "format": {"type": "json_schema", "schema": _CLASSIFY_SCHEMA},
                "effort": "low",
            },
            messages=[{"role": "user", "content": prompt}],
        )
        data = json.loads(next((b.text for b in resp.content if b.type == "text"), ""))
        # Trust but verify the enum — a stray value would break the report form.
        if data["type"] not in INCIDENT_TYPES or data["severity"] not in SEVERITIES:
            return _rules_classify(text)
        return {
            "type": data["type"],
            "severity": data["severity"],
            "confidence": max(0.0, min(1.0, float(data["confidence"]))),
            "source": "ai",
        }
    except Exception:
        logger.warning(
            "Claude classification failed; using rule-based fallback", exc_info=True
        )
        return _rules_classify(text)


def _split_data_url(image: str) -> Optional[tuple[str, str]]:
    """Parse a `data:image/xxx;base64,<data>` URL into (media_type, base64).
    Returns None for anything that isn't a base64 image data URL — a plain
    http(s) URL can't be forwarded to the vision API from here, and a malformed
    string must degrade to "unavailable" rather than raise."""
    if not image or not image.startswith("data:image/"):
        return None
    try:
        header, data = image.split(",", 1)
        media_type = header[len("data:") :].split(";", 1)[0]
        if not data or "base64" not in header:
            return None
        return media_type, data
    except ValueError:
        return None


def _unavailable_classification() -> dict:
    """Neutral result when vision can't run (no key, no anthropic package, or a
    non-image payload). confidence 0 + source 'unavailable' tells the UI to show
    no suggestion rather than a fabricated one."""
    return {
        "type": "jam",
        "severity": "dense",
        "confidence": 0.0,
        "source": "unavailable",
    }


async def classify_incident_image(image: str) -> dict:
    """Classify an incident from a photo (data URL) into {type, severity,
    confidence}. Needs Claude's vision — there is no offline fallback for pixels
    (unlike text's keyword rules), so with no key it returns 'unavailable' and
    the UI simply doesn't offer a photo-based suggestion. Same enum-validation
    and never-raise contract as classify_incident_text."""
    parsed = _split_data_url(image)
    if parsed is None or not ANTHROPIC_KEY:
        return _unavailable_classification()
    try:
        import anthropic
    except ImportError:
        return _unavailable_classification()

    media_type, b64 = parsed
    prompt = (
        "Cette photo montre un incident routier à Abidjan. Classe-le. "
        "type: degraded (nid de poule/route dégradée), accident, jam "
        "(embouteillage), flood (inondation), police (contrôle), works "
        "(travaux). severity: fluid, dense (ralentissements), blocked (voie "
        "bloquée/coupée), danger (risque grave, inondation, accident corporel). "
        "confidence: 0 à 1, ta certitude d'après ce que tu vois réellement."
    )
    try:
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_KEY)
        # The multimodal content-block list is correct at runtime but doesn't
        # match anthropic's typed str-content overload (the text-only
        # recommend()/classify calls do), hence the ignore below.
        resp = await client.messages.create(  # type: ignore[call-overload]
            model=MODEL,
            max_tokens=200,
            output_config={
                "format": {"type": "json_schema", "schema": _CLASSIFY_SCHEMA},
                "effort": "low",
            },
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        data = json.loads(next((b.text for b in resp.content if b.type == "text"), ""))
        if data["type"] not in INCIDENT_TYPES or data["severity"] not in SEVERITIES:
            return _unavailable_classification()
        return {
            "type": data["type"],
            "severity": data["severity"],
            "confidence": max(0.0, min(1.0, float(data["confidence"]))),
            "source": "ai",
        }
    except Exception:
        logger.warning(
            "Claude image classification failed; returning unavailable",
            exc_info=True,
        )
        return _unavailable_classification()


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
