import { AlertTriangle, Siren, CarFront, Waves, ShieldAlert, HardHat, ShieldCheck, Ban } from "lucide-react";
import { TRAFFIC_LEVELS } from "@/lib/mockData";

export const INCIDENT_ICONS = { AlertTriangle, Siren, CarFront, Waves, ShieldAlert, HardHat };

export const getIncidentIcon = (iconName) => INCIDENT_ICONS[iconName] || AlertTriangle;

// Styling for the "avant de partir" AI/rules recommendation, keyed by level.
// Shared by the Trajet page and the map's fullscreen trip planner.
export const RECO_STYLE = {
  clear: { icon: ShieldCheck, tone: "#2fb56b", bg: "rgba(47,181,107,0.10)" },
  caution: { icon: ShieldAlert, tone: "#f59e0b", bg: "rgba(245,158,11,0.10)" },
  avoid: { icon: Ban, tone: "#e0432c", bg: "rgba(224,67,44,0.10)" },
};

export const trafficColorVar = (level, opacity) =>
  opacity != null ? `hsl(var(--traffic-${level}) / ${opacity})` : `hsl(var(--traffic-${level}))`;

// MapLibre GL paint properties are evaluated outside the CSS cascade, so they
// can't read `hsl(var(--x))` custom properties — they need literal colors.
export const trafficColorHex = (level) => TRAFFIC_LEVELS[level]?.hex || "#94a3b8";

// Rough delay (minutes) an incident adds — mirrors backend routing.incident_delay_min
// so the map sheet shows a real estimate instead of a hardcoded "+18 min".
const DELAY_BY_TYPE = { flood: 14, accident: 12, jam: 9, works: 7, degraded: 5, police: 3 };
const DELAY_BY_SEVERITY = { blocked: 12, danger: 15, dense: 6, fluid: 2 };

export const estimateDelayMin = (type, severity) =>
  Math.max(DELAY_BY_TYPE[type] ?? 5, DELAY_BY_SEVERITY[severity] ?? 4);
