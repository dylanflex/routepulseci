import { AlertTriangle, Siren, CarFront, Waves, ShieldAlert, HardHat } from "lucide-react";

export const INCIDENT_ICONS = { AlertTriangle, Siren, CarFront, Waves, ShieldAlert, HardHat };

export const getIncidentIcon = (iconName) => INCIDENT_ICONS[iconName] || AlertTriangle;

export const trafficColorVar = (level, opacity) =>
  opacity != null ? `hsl(var(--traffic-${level}) / ${opacity})` : `hsl(var(--traffic-${level}))`;
