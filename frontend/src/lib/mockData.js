// Static reference data (incident taxonomy, colors, road layout) — not
// domain data. Incidents/posts/comments now come from the backend API,
// see src/context/AppDataContext.jsx.
export const INCIDENT_TYPES = {
  degraded: { label: "Route dégradée", icon: "AlertTriangle", color: "traffic-dense", emoji: "🕳️" },
  accident: { label: "Accident", icon: "Siren", color: "traffic-blocked", emoji: "🚧" },
  jam: { label: "Embouteillage", icon: "CarFront", color: "traffic-dense", emoji: "🚗" },
  flood: { label: "Inondation", icon: "Waves", color: "traffic-danger", emoji: "🌊" },
  police: { label: "Contrôle", icon: "ShieldAlert", color: "info", emoji: "👮" },
  works: { label: "Travaux", icon: "HardHat", color: "traffic-dense", emoji: "🚜" },
};

export const TRAFFIC_LEVELS = {
  fluid: { label: "Fluide", color: "traffic-fluid", hex: "#2fb56b" },
  dense: { label: "Dense", color: "traffic-dense", hex: "#f59e0b" },
  blocked: { label: "Bloqué", color: "traffic-blocked", hex: "#e0432c" },
  danger: { label: "Danger", color: "traffic-danger", hex: "#a855c9" },
};

export const ABIDJAN_CENTER = [-4.0083, 5.3600];
