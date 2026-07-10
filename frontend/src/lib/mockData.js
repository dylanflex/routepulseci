// Static reference data (incident taxonomy, colors, road layout) — not
// domain data. Incidents/posts/comments now come from the backend API,
// see src/context/AppDataContext.jsx.
export const INCIDENT_TYPES = {
  degraded: { label: "Route dégradée", icon: "AlertTriangle", color: "traffic-dense" },
  accident: { label: "Accident", icon: "Siren", color: "traffic-blocked" },
  jam: { label: "Embouteillage", icon: "CarFront", color: "traffic-dense" },
  flood: { label: "Inondation", icon: "Waves", color: "traffic-danger" },
  police: { label: "Contrôle", icon: "ShieldAlert", color: "info" },
  works: { label: "Travaux", icon: "HardHat", color: "traffic-dense" },
};

export const TRAFFIC_LEVELS = {
  fluid: { label: "Fluide", color: "traffic-fluid", hex: "#2fb56b" },
  dense: { label: "Dense", color: "traffic-dense", hex: "#f59e0b" },
  blocked: { label: "Bloqué", color: "traffic-blocked", hex: "#e0432c" },
  danger: { label: "Danger", color: "traffic-danger", hex: "#a855c9" },
};

// Most Abidjanais get around by shared/informal transit, not private cars —
// tagging which modes a report affects is what makes this app relevant to
// them too, not just car owners (see server.py's TRANSPORT_MODES).
export const TRANSPORT_MODES = {
  voiture: { label: "Voiture", icon: "Car" },
  gbaka: { label: "Gbaka", icon: "Bus" },
  woro_woro: { label: "Wôrô-wôrô", icon: "CarFront" },
  moto: { label: "Moto", icon: "Bike" },
  pied: { label: "À pied", icon: "Footprints" },
};

export const ABIDJAN_CENTER = [-4.0083, 5.3600];
