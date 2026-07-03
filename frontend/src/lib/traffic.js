import { AlertTriangle, Siren, CarFront, Waves, ShieldAlert, HardHat } from "lucide-react";
import { TRAFFIC_LEVELS } from "@/lib/mockData";

export const INCIDENT_ICONS = { AlertTriangle, Siren, CarFront, Waves, ShieldAlert, HardHat };

export const getIncidentIcon = (iconName) => INCIDENT_ICONS[iconName] || AlertTriangle;

export const trafficColorVar = (level, opacity) =>
  opacity != null ? `hsl(var(--traffic-${level}) / ${opacity})` : `hsl(var(--traffic-${level}))`;

// MapLibre GL paint properties are evaluated outside the CSS cascade, so they
// can't read `hsl(var(--x))` custom properties — they need literal colors.
export const trafficColorHex = (level) => TRAFFIC_LEVELS[level]?.hex || "#94a3b8";
